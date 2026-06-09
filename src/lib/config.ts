import { type } from 'arktype'
import type { Column } from 'knex-schema-inspector/dist/types/column'

const Join = type({
  table: 'string',
  type: '"inner" | "left" | "right"',
  baseColumn: 'string | null',
  foreignColumn: 'string | null'
})

export const TimeUnit = type('"second" | "minute" | "hour" | "weekday" | "day" | "month" | "year"')

const Chart = type({
  pos: {
    x: 'number',
    y: 'number',
    width: 'number',
    height: 'number'
  },
  title: 'string',
  subtitle: 'string',
  table: 'string | null',
  xTitle: 'string',
  yTitle: 'string',
  method: type.or(
    type({
      type: '"value" | "aggregate_count_unique" | "aggregate_sum"',
      x: 'string | null',
      'xTimeUnit?': TimeUnit,
      y: 'string | null'
    }),
    type({
      type: '"aggregate_count"',
      x: 'string | null',
      'xTimeUnit?': TimeUnit
    }),
    type({
      type: '"aggregate_avg"',
      x: 'string | null',
      'xTimeUnit?': TimeUnit,
      y: 'string | null',
      bars: '"stddev" | "minmax" | null'
    }),
    type({
      type: '"custom"',
      columns: 'string[]',
      fn: 'string'
    })
  ),
  'breakdown?': 'string | null',
  'cumulative?': 'true',
  'traceColors?': 'string[]',
  'barColor?': 'string',
  style: '"bar" | "line" | "pie"',
  'joins?': Join.array(),
  'where?': 'string',
  'xFormatter?': 'string',
  'yFormatter?': 'string',
  'limit?': 'number',
  'sortCol?': 'string',
  'sortDesc?': 'true'
})
export type Chart = typeof Chart.infer

const Connection = type({
  environment: '"local" | "testing" | "development" | "staging" | "production"',
  name: 'string',
  details: type.or(
    {
      client: '"postgres" | "cockroachdb" | "redshift" | "mysql" | "mariadb" | "oracledb" | "mssql"',
      username: 'string',
      'password?': 'string',
      host: 'string',
      'port?': type.or('number | string.numeric.parse', type('""').pipe(() => undefined)),
      database: 'string'
    },
    {
      client: '"sqlite"',
      filename: 'string'
    }
  ),
  charts: Chart.array()
})
export type Connection = typeof Connection.infer

export const Config = type({
  theme: type('"system" |  "light" | "dark"').default('system'),
  connections: Connection.array().default(() => [])
})
  .onDeepUndeclaredKey('delete')
export type Config = typeof Config.infer

export const DEFAULT_BARS_COLOR = '#fb7085'

export const DEFAULT_TRACE_COLORS = [
  '#5470c6',
  '#91cc75',
  '#fac858',
  '#ee6666',
  '#73c0de',
  '#3ba272',
  '#fc8452',
  '#9a60b4',
  '#ea7ccc'
] as const

export function getColumnIdentifier (column: Column): string {
  let identifier = `${column.table}.${column.name}`
  if (column.schema) identifier = `${column.schema}.${identifier}`

  return identifier
}

export function getColumnNonConflictName (column: Column, columns: Column[]): string {
  const conflict = columns.find((columnB) => columnB.name === column.name && column !== columnB)
  const displayName = conflict
    ? conflict.table === column.table && column.schema
      ? `${column.schema}.${column.table}.${column.name}`
      : `${column.table}.${column.name}`
    : column.name

  return displayName
}
