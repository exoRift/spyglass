import { Webview } from 'webview-bun'
import path from 'path'
import { type } from 'arktype'
import Knex from 'knex'
import type { Column } from 'knex-schema-inspector/dist/types/column'
import inspector from 'knex-schema-inspector'

import { type Chart, type Connection, Config } from './lib/config'
import * as logger from './lib/logger'

const CONFIG_LOCATION = path.resolve(process.cwd(), './spyglass.json')
logger.debug('Config Location:', CONFIG_LOCATION)

function loadConfig (): Promise<Config> {
  return Bun.file(CONFIG_LOCATION, { type: 'json' })
    .json()
    .then((obj) => Config(obj))
    .then((cfg) => {
      if (cfg instanceof type.errors) throw cfg.toTraversalError()
      logger.info('Config loaded:', cfg)
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
const webview = new Webview(process.env.NODE_ENV !== 'production')

function constructConnection (options: Connection & { password: string }): Knex.Knex {
  return Knex({
    client: options.client,
    connection: {
      application_name: 'Spyglass',
      user: options.username,
      password: options.password,
      host: options.host,
      port: options.port,
      database: options.database
    }
  })
}

const binds = {
  logInfo: logger.info,
  logWarn: logger.warn,
  logError: logger.error,
  logDebug: logger.debug,
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
  async testConnection (options: Connection & { password: string }): Promise<number | null> {
    const connection = constructConnection(options)

    const ts = performance.now()
    return await connection.raw('SELECT current_user')
      .then(() => performance.now() - ts)
      .catch(() => null)
  },
  async setActiveConnection (index: number, password?: string): Promise<null> {
    if (activeConnection) {
      void activeConnection.destroy()
      activeConnection = undefined
    }
    if (index === -1) return null

    const connection = structuredClone(config.connections[index])
    if (!connection) throw Error('Somehow trying to set nonexistent active connection')

    if (password) connection.password = password
    if (!connection.password) throw Error('Missing password for connection')

    activeConnection = constructConnection(connection as any)

    return null
  },
  getTables (): Promise<Partial<Record<string, Column[]>> | null> {
    if (!activeConnection) throw Error('No active connection')

    const spector = inspector(activeConnection)

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
  queryRows (chart: Pick<Chart, 'table' | 'where' | 'joins'> & { table: string }): Promise<any[] | null> {
    if (!activeConnection) throw Error('Attempted to query without an active connection')

    const query = activeConnection
      .table(chart.table)
      .select('*')
    if (chart.joins) {
      for (const join of chart.joins) {
        query.join(join.table, `${chart.table}.${join.baseColumn}`, `${join.table}.${join.foreignColumn}`)
      }
    }
    if (chart.where) query.whereRaw(chart.where)

    return query
      .then((rows) => {
        logger.debug(rows)
        return rows
      })
      .catch((err) => {
        logger.error('Failed to executive query', err)
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
  var config: Config
  var logInfo: Promisify<typeof binds.logInfo>
  var logWarn: Promisify<typeof binds.logWarn>
  var logError: Promisify<typeof binds.logError>
  var logDebug: Promisify<typeof binds.logDebug>
  var getConfig: Promisify<typeof binds.getConfig>
  var saveConfig: Promisify<typeof binds.saveConfig>
  var testConnection: Promisify<typeof binds.testConnection>
  var setActiveConnection: Promisify<typeof binds.setActiveConnection>
  var getTables: Promisify<typeof binds.getTables>
  var queryRows: Promisify<typeof binds.queryRows>
}
/* eslint-enable no-var */

webview.title = 'Spyglass'
webview.init(`var config = ${JSON.stringify(config)}`)
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
  webview.init('window.addEventListener(\'contextmenu\', (e) => e.preventDefault(), { capture: true })')
  webview.setHTML(compiled)
  webview.runNonBlocking(() => process.exit(0))
} else {
  const worker = new Worker(Bun.resolveSync('./lib/dev/server', import.meta.dir))

  worker.addEventListener('error', (e) => {
    logger.error('Worker Error:', e.message)
    process.exit(1)
  })

  worker.addEventListener('message', (e) => {
    const url: string = e.data

    logger.debug('Vite running on URL:', url)
    if (!url) throw Error('Unexpected: Vite did not return a local address')
    webview.navigate(url)
    webview.runNonBlocking(() => process.exit(0))
  }, { once: true })
}
