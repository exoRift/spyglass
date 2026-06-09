import { Webview } from 'webview-bun'
import path from 'path'
import util from 'util'
import { type } from 'arktype'
import Knex, { type Client } from 'knex'
import type { Column } from 'knex-schema-inspector/dist/types/column'
import open from 'open'
import vm from 'vm'
import { openFileManagerDialog } from 'open-file-manager-dialog'

import { type Chart, type Connection, Config, getColumnIdentifier, getColumnNonConflictName } from './lib/config'
import * as logger from './lib/logger'
import { changecwd } from './lib/depcache'
import { dateBucket } from './lib/database'
import pkg from '../package.json'

const args = util.parseArgs({
  args: process.argv,
  options: {
    config: {
      type: 'string'
    }
  },
  allowPositionals: true
})

const CONFIG_LOCATION = args.values.config ? path.resolve(args.values.config) : path.resolve(process.cwd(), './spyglass.json')
logger.info('Config Location:', CONFIG_LOCATION)

const DRIVERS: Record<Connection['details']['client'], string> = {
  postgres: 'pg',
  cockroachdb: 'pg',
  redshift: 'pg',
  sqlite: 'knex-bun-sqlite',
  mysql: 'mysql2',
  mariadb: 'mysql2',
  oracledb: 'oracledb',
  mssql: 'tedious'
}

const webview = new Webview(process.env.NODE_ENV !== 'production')

function loadConfig (): Promise<Config> {
  return Bun.file(CONFIG_LOCATION, { type: 'json' })
    .json()
    .then((obj) => Config(obj))
    .then((cfg) => {
      if (cfg instanceof type.errors) {
        const err = cfg.toTraversalError()
        webview.init(`window._invalidConfigSchemaError = \`${err.message.replaceAll('`', '\\`')}\``)
        throw err
      }

      logger.info(`Config loaded; ${cfg.connections.length} connections`)
      return cfg
    })
    .catch((err) => {
      logger.warn('Failed to load config. Using defaults...', err)
      return Config({}) as Config
    })
}

const config = await loadConfig()
let activeConnection: Knex.Knex | undefined

function moduleExists (name: string): Promise<boolean> {
  return Bun.resolve(name, import.meta.dirname)
    .then(() => true)
    .catch(() => false)
}

async function constructConnection ({ client, ...details }: Knex.Knex.StaticConnectionConfig & { client: Connection['details']['client'] }): Promise<Knex.Knex | undefined> {
  using _ = await changecwd()

  const driver = DRIVERS[client]

  const installed = await moduleExists(driver)
  if (!installed) {
    logger.info(`Alerting user to missing ${client} driver (${driver})`)
    webview.eval(`window._missingDriver = '${driver}'; document.getElementById('driver-name').innerText = '${driver}'; document.getElementById('client-name').innerText = '${client}'; document.getElementById('driver-modal').showModal()`)
    return undefined
  }

  return Knex({
    client: driver === 'knex-bun-sqlite' ? (await import('knex-bun-sqlite')).default as unknown as typeof Client : driver,
    connection: {
      application_name: 'Spyglass',
      ...details
    },
    pool: {
      min: 0,
      max: 10
    }
  })
}

const binds = {
  logInfo: logger.info,
  logWarn: logger.warn,
  logError: logger.error,
  logDebug: logger.debug,
  async hasDataForge () {
    using _ = await changecwd()
    return await moduleExists('data-forge')
  },
  async installDriver (driver: string, noRestart?: true | null) {
    const version = (pkg.optionalDependencies as Record<string, string>)[driver]
    logger.info('Installing:', driver, version)

    await Bun.$`BUN_BE_BUN=1 ${process.execPath} install -g ${driver}${version ? `@${version}` : ''}`
      .then(() => {
        logger.info(driver, 'installed')

        if (!noRestart) {
          webview.destroy()
          process.execve!(
            process.execPath,
            [process.execPath, ...process.argv.slice(1)],
            process.env
          )
        }
      })
      .catch(() => logger.error(driver, 'failed to install'))
  },
  async openLink (url: string) {
    return await open(url)
      .then(() => true)
  },
  getConfig (): Config {
    return config
  },
  // TODO: Assign schema link
  async saveConfig (cfg: Config): Promise<null | type.errors> {
    const parsed = Config(cfg)
    if (parsed instanceof type.errors) return parsed
    Object.assign(config, parsed)
    return await Bun.write(CONFIG_LOCATION, JSON.stringify(config, null, 2))
      .then(() => null)
      .catch((err) => {
        logger.error('FAILED TO SAVE CONFIG!', err)
        return null
      })
  },
  async testConnection (details: Connection['details'] & { password: string }): Promise<number | null> {
    const connection = await constructConnection(details)
    if (!connection) return null

    const ts = performance.now()
    return await connection.raw('SELECT 1+1')
      .then(() => performance.now() - ts)
      .catch((err) => err.message || err.code || err.toString())
      .finally(() => void connection.destroy())
  },
  async setActiveConnection (index: number, password?: string | null): Promise<number | null> {
    if (activeConnection) {
      void activeConnection.destroy()
      activeConnection = undefined
    }
    if (index === -1) return null

    const connection = config.connections[index]
    if (!connection) throw Error('Somehow trying to set nonexistent active connection')
    const details = structuredClone(connection.details)
    if (details.client !== 'sqlite') {
      if (password !== undefined && password !== null) details.password = password
      if (details.password === undefined) throw Error('Missing password for connection')
    }

    activeConnection = await constructConnection(details)

    return null
  },
  async getTables (): Promise<Partial<Record<string, Column[]>> | null> {
    if (!activeConnection) {
      logger.error('No active connection')
      return null
    }

    const { SchemaInspector } = await import('knex-schema-inspector', { with: { type: 'module' } })
    const spector = SchemaInspector(activeConnection)

    const query = activeConnection.client.config.client === 'pg'
      ? activeConnection.raw<{ rows: Array<{ full_table_name: string }> }>(
        `
          SELECT table_schema || '.' || table_name AS full_table_name
          FROM information_schema.tables
          WHERE table_type = 'BASE TABLE'
            AND table_schema NOT IN ('pg_catalog', 'information_schema')
        `
      )
        .then(({ rows }) => rows.map((r) => r.full_table_name))
      : spector.tables()

    return query
      .then((tables) => Promise.all(tables.map((t) => {
        let tableName
        const dotIndex = t.indexOf('.')
        if (dotIndex !== -1) {
          const schema = t.slice(0, dotIndex)
          tableName = t.slice(dotIndex + 1)
          spector.withSchema?.(schema)
        } else tableName = t

        return spector.columnInfo(tableName).then((c) => [t, c])
      })))
      .then(Object.fromEntries)
      .catch((err) => {
        logger.warn('Failed to connect to database', err)
        return null
      })
  },
  async queryRows (chart: Pick<Chart, 'table' | 'where' | 'joins' | 'limit' | 'sortCol' | 'sortDesc' | 'method' | 'breakdown'> & { table: string }): Promise<any[] | null | string> {
    if (!activeConnection) {
      logger.error('Attempted to query without an active connection')
      return null
    }

    const validJoins = chart.joins?.filter((j) => j.baseColumn && j.foreignColumn) ?? []

    const query = activeConnection(chart.table)
    for (const join of validJoins) {
      if (!join.baseColumn || !join.foreignColumn) continue

      query[join.type === 'inner' ? 'join' : join.type === 'left' ? 'leftJoin' : 'rightJoin'](join.table, `${chart.table}.${join.baseColumn}`, '=', `${join.table}.${join.foreignColumn}`)
    }
    if (chart.where) query.whereRaw(chart.where)

    let didSelect = false
    switch (chart.method.type) {
      case 'value':
        if (chart.method.x && chart.method.y) {
          didSelect = true
          query.select({
            x: chart.method.xTimeUnit ? dateBucket(activeConnection, chart.method.xTimeUnit, chart.method.x) : chart.method.x,
            y: chart.method.y
          })
        }
        break
      case 'aggregate_count':
        if (chart.method.x) {
          didSelect = true
          query
            .select({
              x: chart.method.xTimeUnit ? dateBucket(activeConnection, chart.method.xTimeUnit, chart.method.x) : chart.method.x,
              y: activeConnection.count(chart.method.x)
            })
            .groupBy('x')
        }
        break
      case 'aggregate_count_unique':
        if (chart.method.x && chart.method.y) {
          didSelect = true
          query
            .select({
              x: chart.method.xTimeUnit ? dateBucket(activeConnection, chart.method.xTimeUnit, chart.method.x) : chart.method.x,
              y: activeConnection.countDistinct(chart.method.y)
            })
            .groupBy('x')
        }
        break
      case 'aggregate_avg':
        if (chart.method.x && chart.method.y) {
          didSelect = true
          query
            .select({
              x: chart.method.xTimeUnit ? dateBucket(activeConnection, chart.method.xTimeUnit, chart.method.x) : chart.method.x,
              y: activeConnection.avg(chart.method.y)
            })
            .groupBy('x')

          switch (chart.method.bars) {
            case 'stddev':
              query
                .select({
                  lowBar: activeConnection.raw('? - STDDEV(??)', [activeConnection.avg(chart.method.y), chart.method.y]),
                  highBar: activeConnection.raw('? + STDDEV(??)', [activeConnection.avg(chart.method.y), chart.method.y])
                })
              break
            case 'minmax':
              query
                .select({
                  lowBar: activeConnection.min(chart.method.y),
                  highBar: activeConnection.max(chart.method.y)
                })
              break
            case null: break
          }
        }
        break
      case 'aggregate_sum':
        if (chart.method.x && chart.method.y) {
          didSelect = true
          query
            .select({
              x: chart.method.xTimeUnit ? dateBucket(activeConnection, chart.method.xTimeUnit, chart.method.x) : chart.method.x,
              y: activeConnection.sum(chart.method.y)
            })
            .groupBy('x')
        }
        break
      case 'custom': {
        if (chart.method.columns.length) {
          const tables = await binds.getTables()
          if (!tables) throw new Error('Unexpected: Querying custom map fn and tables is null')

          const columns = [...tables[chart.table]!]
          if (chart.joins) {
            for (const join of chart.joins) columns.push(...tables[join.table]!)
          }

          didSelect = true
          query
            .select(chart.method.columns.map((c) =>
              activeConnection!
                .column(c)
                .as(
                  getColumnNonConflictName(columns.find((col) => getColumnIdentifier(col) === c)!, columns)
                    .replaceAll('.', '_')
                ))
            )
        }
        break
      }
    }

    if (!didSelect) return null

    if (chart.breakdown) {
      query.select({ group: chart.breakdown })
      if (chart.method.type.includes('aggregate')) query.groupBy('group')
    }

    if (chart.sortCol) query.orderBy(chart.sortCol === '~aggregation' ? 'y' : chart.sortCol, chart.sortDesc ? 'desc' : 'asc')
    if (chart.limit) query.limit(chart.limit)

    return await query
      .then(async (rows) => {
        if (chart.method.type === 'custom') {
          using _ = await changecwd()

          const script = new vm.Script(`
            (() => {
              ${chart.method.fn.replaceAll(/import|require/g, '')}
            })()
          `)

          try {
            logger.debug('Running custom map function')

            const value = script.runInNewContext(
              {
                rows,
                forge: (await import('data-forge').catch(() => ({ default: undefined }))).default,
                log: logger.debug.bind('MAPFN')
              },
              {
                timeout: 5000
              }
            )

            if (!Array.isArray(value)) return 'Returned value is not an array'
            if (!('x' in value[0]) || !('y' in value[0])) return 'Santi Check: return[0] does not have an x and y property'

            return value
          } catch (err: any) {
            if ('message' in err) return err.message
            else {
              logger.error(err)
              return 'Unknown Error'
            }
          }
        } else return rows
      })
      .finally()
      .catch((err) => {
        logger.error('Failed to execute query', err)
        return null
      })
  },
  promptFile (accept?: string[] | null) {
    return openFileManagerDialog(process.cwd(), { filter: accept ?? undefined, limit: 1 })
      .then(({ files, canceled }) => {
        if (canceled) return null
        else return files[0] ?? null
      })
      .catch((err) => {
        logger.error('Failed to pick a file in selection dialog', err)
        return null
      })
  },
  closeApplication () {
    process.exit(0)
  }
/* eslint-disable-next-line @typescript-eslint/no-empty-object-type */
} as const satisfies Record<string, Promise<{} | null> | {} | null>

for (const name in binds) {
  webview.bind(name, binds[name as keyof typeof binds])
}

type Promisify<T extends (...args: any[]) => any> = (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>

/* eslint-disable no-var */
declare global {
  var _invalidConfigSchemaError: string | undefined
  var _config: Config
  var logInfo: Promisify<typeof binds.logInfo>
  var logWarn: Promisify<typeof binds.logWarn>
  var logError: Promisify<typeof binds.logError>
  var logDebug: Promisify<typeof binds.logDebug>
  var hasDataForge: Promisify<typeof binds.hasDataForge>
  var installDriver: Promisify<typeof binds.installDriver>
  var openLink: Promisify<typeof binds.openLink>
  var getConfig: Promisify<typeof binds.getConfig>
  var saveConfig: Promisify<typeof binds.saveConfig>
  var testConnection: Promisify<typeof binds.testConnection>
  var setActiveConnection: Promisify<typeof binds.setActiveConnection>
  var getTables: Promisify<typeof binds.getTables>
  var queryRows: Promisify<typeof binds.queryRows>
  var promptFile: Promisify<typeof binds.promptFile>
  var closeApplication: Promisify<typeof binds.closeApplication>
}
/* eslint-enable no-var */

webview.title = 'Spyglass'
webview.init(`var _config = ${JSON.stringify(config)}`)
webview.init(`
const originalInfo = console.info
const originalError = console.error
const originalWarn = console.warn
const originalDebug = console.debug
console.info = (...args) => {
  void logInfo(...args).catch(() => logWarn('Failed to log to INFO'))
  originalInfo(...args)
}
console.error = (...args) => {
  void logError(...args).catch(() => logWarn('Failed to log to ERROR'))
  originalError(...args)
}
console.warn = (...args) => {
  void logWarn(...args).catch(() => logWarn('Failed to log to WARN'))
  originalWarn(...args)
}
console.debug = (...args) => {
  void logDebug(...args).catch(() => logWarn('Failed to log to DEBUG'))
  originalDebug(...args)
}
window.addEventListener('error', (e) => { void logError('Webview Runtime Error:', e.message) }, { passive: true })
`)
if (process.env.NODE_ENV === 'production') {
  const { default: template } = await import('./view/dist/index.html', { with: { type: 'file' } })
  const compiled = await Bun.file(template).text()
  webview.init('window.addEventListener("beforeunload", (e) => { e.preventDefault(); e.returnValue = "" })')
  webview.setHTML(compiled)
  webview.runNonBlocking(() => /* process.exit(0) */{})
} else {
  const api = Bun.serve({
    async fetch (req) {
      const route = new URL(req.url).pathname

      if (route === '/_binds') {
        return Response.json(Object.keys(binds), {
          headers: {
            'Access-Control-Allow-Origin': '*'
          }
        })
      }

      const bind = route.slice(1) as keyof typeof binds
      if (!(bind in binds)) return new Response('Not Found', { status: 404 })

      const result = await binds[bind](...(await req.json().catch(() => []) as [any, any]))
      return Response.json(result, {
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      })
    }
  })
  logger.debug('Shim API running on URL:', api.url.href)

  const worker = new Worker(Bun.resolveSync('./lib/dev/server', import.meta.dir), { argv: [api.port] })

  worker.addEventListener('error', (e) => {
    logger.error('Worker Error:', e.message)
    process.exit(1)
  })

  worker.addEventListener('message', (e) => {
    const url: string = e.data

    logger.debug('Vite running on URL:', url)
    if (!url) throw Error('Unexpected: Vite did not return a local address')
    // webview.init('document.addEventListener("keydown", (e) => { if (e.key === ";") { debugger } })')
    webview.navigate(url)
    webview.runNonBlocking(() => process.exit(0))
  }, { once: true })
}
