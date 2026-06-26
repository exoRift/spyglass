/* eslint-disable @typescript-eslint/only-throw-error */
import { Webview } from 'webview-bun'
import path from 'path'
import util from 'util'
import { type } from 'arktype'
import Knex, { type Client } from 'knex'
import { SchemaInspector } from 'knex-schema-inspector'
import open from 'open'
import vm from 'vm'
import os from 'os'
import { spawnSync } from 'child_process'
import fs from 'fs'

import { type Chart, type Connection, Config } from './lib/config'
import { getColumnIdentifier, getColumnNonConflictName, getTableNonConflictName, type Table } from './lib/constants'
import * as logger from './lib/logger'
import { changecwd, manuallyResolveModule } from './lib/depcache'
import { dateBucket } from './lib/database'
import { getExecutablePath } from './lib/shell'
import { openFile } from './lib/files'
import { constructReportLink, stringifyError } from './lib/errors'

import pkg from '../package.json'

logger.info('Starting Spyglass...')

if (process.env.NODE_ENV === 'production') {
  /**
   * Synchronous bare-bones version of `open` because you can't schedule async tasks on `exit` event
   * @param url The URL to open
   */
  function openSync (url: string): void {
    switch (process.platform) {
      case 'darwin': spawnSync('open', [url]); break
      case 'win32': spawnSync('cmd', ['/c', 'start', '', url]); break
      default: spawnSync('xdg-open', [url]); break
    }
  }

  const encoder = new TextEncoder()
  const LOG_PATH = path.resolve(os.tmpdir(), 'spyglass', `spyglass-${new Date().toISOString().replaceAll(':', '-')}.log`)
  fs.mkdirSync(path.resolve(os.tmpdir(), 'spyglass'))
  const file = Bun.file(LOG_PATH)
  const sink = file.writer()

  const wrap = (orig: (...args: any[]) => void) =>
    (...args: any[]) => {
      const line = args.map((a) => (typeof a === 'string' ? Bun.stripANSI(a) : Bun.inspect(a, { colors: false }))).join(' ')
      void sink.write(encoder.encode(line + '\n'))
      orig(...args)
    }

  console.log = wrap(console.log.bind(console))
  console.error = wrap(console.error.bind(console))
  console.warn = wrap(console.warn.bind(console))
  console.debug = wrap(console.debug.bind(console)) // eslint-disable-line no-console
  console.info = wrap(console.info.bind(console))

  /**
   * Before the program exits, if a non-zero exit code, dump to the log and open it to the user
   * @param code The exit code
   */
  function onExit (code: number): void {
    if (code) {
      fs.appendFileSync(LOG_PATH, `SPYGLASS HAS CRASHED! :( (Code ${code})`)
      openSync(LOG_PATH)
    }

    process.exit(code)
  }

  process.on('uncaughtException', (err) => {
    void sink.write(`Report Uncaught Exception: ${constructReportLink('RUNTIME EXCEPTION', err)}`)
  })
  process.on('unhandledRejection', (err) => {
    void sink.write(`Report Unhandled Rejection: ${constructReportLink('RUNTIME REJECTION', err)}`)
  })
  process.on('beforeExit', onExit)
  process.on('exit', onExit)
}

const args = util.parseArgs({
  args: process.argv,
  options: {
    config: {
      type: 'string'
    }
  },
  allowPositionals: true
})

const CONFIG_LOCATION = args.values.config ? path.resolve(args.values.config) : path.resolve(os.homedir(), './spyglass.json')
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

/**
 * Load the Spyglass config JSON
 * @returns The parsed config
 */
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

/**
 * Check if a module exists and can be resolved
 * @param name The name of the module
 * @returns    Whether the module can be resolved
 */
function moduleExists (name: string): boolean {
  try {
    require.resolve(name)
    return true
  } catch {
    return false
  }
}

/**
 * Construct a Knex connection given connection details
 * @param details        The connection details
 * @param details.client The database client to use
 * @returns              The Knex instance
 */
async function constructConnection ({ client, ...details }: Knex.Knex.StaticConnectionConfig & { client: Connection['details']['client'] }): Promise<Knex.Knex> {
  using _ = await changecwd()

  const driver = DRIVERS[client]

  const installed = moduleExists(driver)
  if (!installed) {
    logger.info(`Alerting user to missing ${client} driver (${driver})`)
    webview.eval(`window.alertMissingDriver?.('${driver}', '${client}')`)
    throw new Error('Could not construct connection. (Is the driver installed?)')
  }

  return Knex({
    client: driver === 'knex-bun-sqlite' ? require('knex-bun-sqlite') as unknown as typeof Client : driver,
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
  async hasModule (specifier: string) {
    using _ = await changecwd()
    return moduleExists(specifier)
  },
  async installDriver (driver: string) {
    const version = (pkg.optionalDependencies as Record<string, string>)[driver]
    logger.info('Installing:', driver, version)

    const execPath = await getExecutablePath()
    return Bun.$`BUN_BE_BUN=1 ${execPath} install -g ${driver}${version ? `@${version}` : ''}`
      .catch((err) => {
        if (err instanceof Bun.$.ShellError && err.exitCode === 4083) return
        throw err
      })
      .then(async () => {
        using _ = await changecwd()
        logger.info(driver, 'installed')

        await manuallyResolveModule(driver)
        return null
      })
      .catch((err) => {
        throw new Error(`Failed to install driver: ${driver}`, { cause: err })
      })
  },
  async openLink (url: string) {
    return await open(url)
      .then(() => true)
  },
  getConfig (): Config {
    return config
  },
  getConfigLocation (): string {
    return CONFIG_LOCATION
  },
  async saveConfig (cfg: Config): Promise<null> {
    const parsed = Config(cfg)
    if (parsed instanceof type.errors) throw parsed
    Object.assign(config, parsed)

    ;(parsed as any).$schema = `https://raw.githubusercontent.com/exoRift/spyglass/refs/tags/v${pkg.version}/schema/config.json`
    return await Bun.write(CONFIG_LOCATION, JSON.stringify(parsed, null, 2))
      .then(() => null)
      .catch((err) => {
        logger.error('FAILED TO WRITE TO CONFIG FILE!', err)
        throw err
      })
  },
  async testConnection (details: Connection['details'] & { password: string }): Promise<number> {
    const connection = await constructConnection(details)

    const ts = performance.now()
    return await connection.raw('SELECT 1+1')
      .then(() => performance.now() - ts)
      .catch((err) => { throw err.message || err.code || err.toString() })
      .finally(() => void connection.destroy())
  },
  async setActiveConnection (index: number, password?: string | null): Promise<null> {
    if (activeConnection) {
      void activeConnection.destroy()
      activeConnection = undefined
    }
    if (index === -1) return null

    const connection = config.connections[index]
    if (!connection) throw new Error('Somehow trying to set nonexistent active connection')
    const details = structuredClone(connection.details)
    if (details.client !== 'sqlite') {
      if (password !== undefined && password !== null) details.password = password
      if (details.password === undefined) throw new Error('Missing password for connection')
    }

    activeConnection = await constructConnection(details)

    return null
  },
  async getTables (): Promise<Record<string, Table>> {
    if (!activeConnection) throw new Error('Unable to get tables: No active connection')

    const spector = SchemaInspector(activeConnection)

    const query = spector.tableInfo()

    return query
      .then((tables) => Promise.all(tables.map((table) => {
        if (table.schema) spector.withSchema?.(table.schema)

        let tableIdentifier = table.name
        if (table.schema) tableIdentifier = `${table.schema}.${tableIdentifier}`

        return spector.columnInfo(table.name).then((columns) => [tableIdentifier, {
          ...table,
          identifier: tableIdentifier,
          display_name: getTableNonConflictName(table, tables),
          columns: columns.map((c) => ({
            ...c,
            table: tableIdentifier,
            identifier: getColumnIdentifier(c)
          }))
        }])
      })))
      .then(Object.fromEntries)
      .catch((err) => {
        throw new Error('Failed to connect to database', { cause: err })
      })
  },
  async queryRows (chart: Chart & { table: string }): Promise<any[] | null> {
    if (!activeConnection) throw new Error('Unable to get rows: No active connection')

    /**
     * Resolve a column into a column name or an expression
     * @warn Assumes activeConnection !== null
     * @param column The column name/expression
     * @returns      The column name or expression
     */
    function resolveColumn (column: string): string | Knex.Knex.Raw {
      return column.startsWith('~expr:')
        ? activeConnection!.raw(chart.expressions?.[column.slice('~expr:'.length)] ?? '0')
        : column
    }

    const validJoins = chart.joins?.filter((j) => j.baseColumn && j.foreignColumn) ?? []

    const query = activeConnection(chart.table)
    for (const join of validJoins) {
      if (!join.baseColumn || !join.foreignColumn) continue

      query[join.type === 'inner' ? 'join' : join.type === 'left' ? 'leftJoin' : 'rightJoin'](join.table, join.baseColumn, '=', join.foreignColumn)
    }
    if (chart.where) query.whereRaw(chart.where)

    let didSelect = false
    switch (chart.method.type) {
      case 'value':
        if (chart.method.x && chart.method.y) {
          didSelect = true
          query.select({
            x: chart.method.xTimeBin ? dateBucket(activeConnection, chart.method.xTimeBin, resolveColumn(chart.method.x)) : resolveColumn(chart.method.x),
            y: resolveColumn(chart.method.y)
          })
        }
        break
      case 'aggregate_count':
        if (chart.method.x) {
          didSelect = true
          query
            .select({
              x: chart.method.xTimeBin ? dateBucket(activeConnection, chart.method.xTimeBin, resolveColumn(chart.method.x)) : resolveColumn(chart.method.x),
              y: activeConnection.count(resolveColumn(chart.method.x))
            })
            .groupBy('x')
        }
        break
      case 'aggregate_count_unique':
        if (chart.method.x && chart.method.y) {
          didSelect = true
          query
            .select({
              x: chart.method.xTimeBin ? dateBucket(activeConnection, chart.method.xTimeBin, resolveColumn(chart.method.x)) : resolveColumn(chart.method.x),
              y: activeConnection.countDistinct(resolveColumn(chart.method.y))
            })
            .groupBy('x')
        }
        break
      case 'aggregate_avg':
        if (chart.method.x && chart.method.y) {
          didSelect = true
          query
            .select({
              x: chart.method.xTimeBin ? dateBucket(activeConnection, chart.method.xTimeBin, resolveColumn(chart.method.x)) : resolveColumn(chart.method.x),
              y: activeConnection.avg(resolveColumn(chart.method.y))
            })
            .groupBy('x')

          switch (chart.method.bars) {
            case 'stddev':
              if (activeConnection.client.dialect === 'sqlite3') {
                query
                  .select({
                    lowBar: activeConnection.raw(':value - SQRT(AVG(:column: * :column:) - AVG(:column:) * AVG(:column:))', { value: activeConnection.avg(resolveColumn(chart.method.y)), column: resolveColumn(chart.method.y) }),
                    highBar: activeConnection.raw(':value + SQRT(AVG(:column: * :column:) - AVG(:column:) * AVG(:column:))', { value: activeConnection.avg(resolveColumn(chart.method.y)), column: resolveColumn(chart.method.y) })
                  })
              } else {
                query
                  .select({
                    lowBar: activeConnection.raw('? - STDDEV(??)', [activeConnection.avg(resolveColumn(chart.method.y)), resolveColumn(chart.method.y)]),
                    highBar: activeConnection.raw('? + STDDEV(??)', [activeConnection.avg(resolveColumn(chart.method.y)), resolveColumn(chart.method.y)])
                  })
              }
              break
            case 'minmax':
              query
                .select({
                  lowBar: activeConnection.min(resolveColumn(chart.method.y)),
                  highBar: activeConnection.max(resolveColumn(chart.method.y))
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
              x: chart.method.xTimeBin ? dateBucket(activeConnection, chart.method.xTimeBin, resolveColumn(chart.method.x)) : resolveColumn(chart.method.x),
              y: activeConnection.sum(resolveColumn(chart.method.y))
            })
            .groupBy('x')
        }
        break
      case 'custom': {
        if (chart.method.columns.length) {
          const tables = await binds.getTables()

          const columns = [...tables[chart.table]!.columns]
          if (chart.joins) {
            for (const join of chart.joins) columns.push(...tables[join.table]!.columns)
          }

          didSelect = true
          query
            .select(chart.method.columns.map((col) => {
              if (col.startsWith('~expr:')) {
                return activeConnection!
                  .column(activeConnection!.raw(chart.expressions?.[col.slice('~expr:'.length)] ?? '0')).as(col.slice('~expr:'.length))
              }

              const column = columns.find((c) => c.identifier === col)
              if (!column) {
                logger.warn(`Column "${col}" present in custom method columns to query, but the column does not exist`)
                return activeConnection!.raw('\'MISSING COLUMN\'')
              }

              return activeConnection!
                .column(col)
                .as(getColumnNonConflictName(column, columns).replaceAll('.', '_'))
            })
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

    if (chart.sortCol) {
      query.orderBy(
        chart.sortCol === '~aggregation' || ('y' in chart.method && chart.sortCol === chart.method.y)
          ? 'y'
          : 'x' in chart.method && chart.sortCol === chart.method.x
            ? 'x'
            : resolveColumn(chart.sortCol) as unknown as Knex.Knex.QueryBuilder,
        chart.sortDesc
          ? 'desc'
          : 'asc'
      )
    }
    if (chart.limit) query.limit(chart.limit)

    return await query
      .then(async (rows) => {
        if (chart.method.type === 'custom') {
          using _ = await changecwd()

          const script = new vm.Script(`
            (() => {
              ${chart.method.fn}
            })()
          `)

          let forge
          try {
            forge = require('data-forge')
          } catch {
            forge = null
          }

          logger.debug('Running custom map function')

          const value = script.runInNewContext(
            {
              rows,
              forge,
              log: logger.debug.bind('MAPFN')
            },
            {
              timeout: 5000
            }
          )

          if (!Array.isArray(value)) throw new Error('Returned value is not an array')
          if (!('x' in value[0]) || !('y' in value[0])) throw new Error('Sanity Check: return[0] does not have an x and y property')

          return value
        } else return rows
      })
      .catch((err) => {
        throw new Error('Failed to execute query', { cause: err })
      })
  },
  promptFile (title: string, accept?: string[] | null, description?: string | null) {
    return openFile({
      title,
      startPath: process.cwd(),
      filterPatterns: accept ?? undefined,
      filterPatternsDescription: description ?? undefined
    })
      .catch((err) => {
        if (err instanceof Error && err.message === 'no file selected') return null

        throw new Error('Failed to pick a file in selection dialog', { cause: err })
      })
  },
  closeApplication () {
    process.exit(0)
  }
/* eslint-disable-next-line @typescript-eslint/no-empty-object-type */
} as const satisfies Record<string, Promise<{} | null> | {} | null>
export type Binds = typeof binds

export type Promisify<T extends (...args: any[]) => any> = (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>
export type PromisifiedBinds = {
  [K in keyof Binds]: Promisify<Binds[K]>
}

/**
 * Deeply unwrap causes from an error
 * @see https://github.com/oven-sh/bun/issues/18357
 * @param err The error to unwrap
 * @returns   A flattened array of causes
 */
function unwrapCauses (err: unknown): Error[] {
  if (!err) return []
  if (!(err instanceof Error)) return [err as Error]

  return [err, ...unwrapCauses(err.cause)]
}

/**
 * Wrap a binding callback to catch errors to log them to the console and prepare them for transport
 * @param callback The callback
 * @returns        The wrapped callback
 */
function wrapBind<T extends (...params: any[]) => any> (callback: T): Promisify<T> {
  return async (...params) => {
    try {
      return await callback(...params)
    } catch (err) {
      // TEMP: https://github.com/oven-sh/bun/issues/18357
      if (err instanceof Error) logger.error(...unwrapCauses(err))
      else logger.error(err)

      throw stringifyError(err)
    }
  }
}

for (const name in binds) {
  webview.bind(
    name,
    wrapBind(binds[name as keyof typeof binds])
  )
}

webview.title = 'Spyglass'
webview.init(`var _config = ${JSON.stringify(config)}; var _configLocation = ${JSON.stringify(CONFIG_LOCATION)}`)
webview.init(`
const originalInfo = console.info
const originalError = console.error
const originalWarn = console.warn
const originalDebug = console.debug
console.info = (...args) => {
  originalInfo(...args)
  void logInfo(...args).catch(() => logWarn('Failed to log to INFO', args))
}
console.error = (...args) => {
  originalError(...args)
  void logError(...args).catch(() => logWarn('Failed to log to ERROR', args))
}
console.warn = (...args) => {
  originalWarn(...args)
  void logWarn(...args).catch(() => originalWarn('Failed to log to WARN', args))
}
console.debug = (...args) => {
  originalDebug(...args)
  void logDebug(...args).catch(() => logWarn('Failed to log to DEBUG', args))
}
window.addEventListener('error', (e) => { void logError('Webview Runtime Error:', e.message) }, { passive: true })
`)
if (process.env.NODE_ENV === 'production') {
  const { default: template } = await import('./view/dist/index.html', { with: { type: 'file' } })
  const compiled = await Bun.file(template as unknown as string).text()
  webview.init('window.addEventListener("beforeunload", (e) => { e.preventDefault(); e.returnValue = "" })')
  webview.setHTML(compiled)
  webview.runNonBlocking(() => process.exit(0))
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
    webview.init('document.addEventListener("keydown", (e) => { if (e.key === ";") { debugger } })')
    webview.navigate(url)
    webview.runNonBlocking(() => process.exit(0))
  }, { once: true })
}
