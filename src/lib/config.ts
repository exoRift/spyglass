import { type } from 'arktype'

const Join = type({
  table: 'string',
  type: '"inner" | "left" | "right"',
  baseColumn: 'string | null',
  foreignColumn: 'string | null'
})

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
      y: 'string | null'
    }),
    type({
      type: '"aggregate_count"',
      x: 'string | null'
    }),
    type({
      type: '"aggregate_avg"',
      x: 'string | null',
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
