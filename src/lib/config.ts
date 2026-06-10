import { type } from 'arktype'

import { TIME_UNITS } from './constants'

const Join = type({
  table: 'string',
  type: '"inner" | "left" | "right"',
  baseColumn: 'string | null',
  foreignColumn: 'string | null'
})

const TimeUnit = type.enumerated(...TIME_UNITS)
const ValueUnit = type('"currency" | "percentage"')

const Chart = type({
  id: 'number',
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
      'xTimeBin?': TimeUnit,
      y: 'string | null'
    }),
    type({
      type: '"aggregate_count"',
      x: 'string | null',
      'xTimeBin?': TimeUnit
    }),
    type({
      type: '"aggregate_avg"',
      x: 'string | null',
      'xTimeBin?': TimeUnit,
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
  'xUnit?': ValueUnit,
  'yUnit?': ValueUnit,
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
  charts: Chart.array(),
  chartIdIncrementor: 'number'
})
export type Connection = typeof Connection.infer

export const Config = type({
  theme: type('"system" |  "light" | "dark"').default('system'),
  connections: Connection.array().default(() => [])
})
  .onDeepUndeclaredKey('delete')
export type Config = typeof Config.infer
