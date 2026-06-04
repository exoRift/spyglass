import { Webview } from 'webview-bun'
import path from 'path'
import util from 'util'
import { type } from 'arktype'
import Knex from 'knex'
import type { Column } from 'knex-schema-inspector/dist/types/column'
import open from 'open'

import { type Chart, type Connection, Config } from './lib/config'
import * as logger from './lib/logger'
import { changecwd } from './lib/depcache'

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

const DRIVERS: Record<Connection['client'], string> = {
  pg: 'pg',
  sqlite3: 'better-sqlite3',
  mysql: 'mysql2',
  oracledb: 'oracledb',
  tedious: 'tedious'
}

function loadConfig (): Promise<Config> {
  return Bun.file(CONFIG_LOCATION, { type: 'json' })
    .json()
    .then((obj) => Config(obj))
    .then((cfg) => {
      if (cfg instanceof type.errors) throw cfg.toTraversalError()
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

/** View */
const webview = new Webview(/* process.env.NODE_ENV !== 'production' */true)

function moduleExists (name: string): boolean {
  try {
    Bun.resolveSync(name, import.meta.dirname)
    return true
  } catch {
    return false
  }
}

function driverIsInstalled (client: Connection['client']): boolean {
  const driver = DRIVERS[client]
  const installed = moduleExists(driver)

  if (!installed) {
    logger.info(`Alerting user to missing ${client} driver (${driver})`)
    webview.eval(`window._missingDriver = '${driver}'; document.getElementById('driver-name').innerText = '${driver}'; document.getElementById('client-name').innerText = '${client}'; document.getElementById('driver-modal').showModal()`)
    return false
  }

  return true
}

async function constructConnection (client: Connection['client'], details: Knex.Knex.StaticConnectionConfig): Promise<Knex.Knex | undefined> {
  using _ = await changecwd()

  const installed = driverIsInstalled(client)
  if (!installed) return undefined

  return Knex({
    client,
    connection: {
      application_name: 'Spyglass',
      ...details
    }
  })
}

const binds = {
  logInfo: logger.info,
  logWarn: logger.warn,
  logError: logger.error,
  logDebug: logger.debug,
  async installDriver (driver: string) {
    logger.info('Installing:', driver)

    await Bun.$`BUN_BE_BUN=1 ${process.execPath} install -g ${driver}`
      .then(() => {
        logger.info(driver, 'installed')
        webview.destroy()
        process.execve!(
          process.execPath,
          [process.execPath, ...process.argv.slice(1)],
          process.env
        )
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
  },
  async testConnection (client: Connection['client'], options: Connection['details'] & { password: string }): Promise<number | null> {
    const details = {
      host: options.host,
      port: options.port,
      username: options.username,
      password: options.password,
      database: options.database
    }

    const connection = await constructConnection(client, details)
    if (!connection) return null

    const ts = performance.now()
    return await connection.raw('SELECT current_user')
      .then(() => performance.now() - ts)
      .catch(() => null)
      .finally(() => void connection.destroy())
  },
  async setActiveConnection (index: number, password?: string): Promise<number | null> {
    if (activeConnection) {
      void activeConnection.destroy()
      activeConnection = undefined
    }
    if (index === -1) return null

    const connection = config.connections[index]
    if (!connection) throw Error('Somehow trying to set nonexistent active connection')
    const details = structuredClone(connection.details)
    if (password !== undefined) details.password = password
    if (details.password === undefined) throw Error('Missing password for connection')

    activeConnection = await constructConnection(connection.client, details)

    return null
  },
  async getTables (): Promise<Partial<Record<string, Column[]>> | null> {
    if (!activeConnection) {
      logger.error('No active connection')
      return null
    }

    // Dynamically import here to ensure the inspector resolves at runtime
    // and to avoid potential deadlocks in Bun single-file builds.
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
  async queryRows (chart: Pick<Chart, 'table' | 'where' | 'joins' | 'limit' | 'sortCol' | 'sortDesc'> & { table: string }): Promise<any[] | null> {
    if (!activeConnection) {
      logger.error('Attempted to query without an active connection')
      return null
    }

    const validJoins = chart.joins?.filter((j) => j.baseColumn && j.foreignColumn) ?? []

    // TODO: Only query the needed columns and embed aggregation at the SQL level.
    // TODO: For custom map functions, multi-select for which columns to select (auto-alias if overlap)
    const query = activeConnection
      .table(chart.table)
      .select('*')
    for (const join of validJoins) {
      if (!join.baseColumn || !join.foreignColumn) continue

      query[join.type === 'inner' ? 'join' : join.type === 'left' ? 'leftJoin' : 'rightJoin'](join.table, `${chart.table}.${join.baseColumn}`, '=', `${join.table}.${join.foreignColumn}`)
    }
    if (chart.where) query.whereRaw(chart.where)

    if (chart.sortCol) query.orderBy(chart.sortCol, chart.sortDesc ? 'desc' : 'asc')
    if (chart.limit) query.limit(chart.limit)

    return await query
      .finally()
      .catch((err) => {
        logger.error('Failed to execute query', err)
        return null
      })
  }
/* eslint-disable-next-line @typescript-eslint/no-empty-object-type */
} as const satisfies Record<string, Promise<{} | null> | {} | null>

for (const name in binds) {
  webview.bind(name, binds[name as keyof typeof binds])
}

type Promisify<T extends (...args: any[]) => any> = (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>

/* eslint-disable no-var */
declare global {
  var _config: Config
  var logInfo: Promisify<typeof binds.logInfo>
  var logWarn: Promisify<typeof binds.logWarn>
  var logError: Promisify<typeof binds.logError>
  var logDebug: Promisify<typeof binds.logDebug>
  var openLink: Promisify<typeof binds.openLink>
  var getConfig: Promisify<typeof binds.getConfig>
  var saveConfig: Promisify<typeof binds.saveConfig>
  var testConnection: Promisify<typeof binds.testConnection>
  var setActiveConnection: Promisify<typeof binds.setActiveConnection>
  var getTables: Promisify<typeof binds.getTables>
  var queryRows: Promisify<typeof binds.queryRows>
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
  void logInfo(...args).catch(() => logWarn('Failed to log to INFO))
  originalInfo(...args)
}
console.error = (...args) => {
  void logError(...args).catch(() => logWarn('Failed to log to ERROR))
  originalError(...args)
}
console.warn = (...args) => {
  void logWarn(...args).catch(() => logWarn('Failed to log to WARN))
  originalWarn(...args)
}
console.debug = (...args) => {
  void logDebug(...args).catch(() => logWarn('Failed to log to DEBUG))
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
    webview.init('document.addEventListener("keydown", (e) => { if (e.key === ";") { debugger } })')
    webview.navigate(url)
    webview.runNonBlocking(() => process.exit(0))
  }, { once: true })
}
