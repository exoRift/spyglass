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
      type: '"column" | "aggregate_sum"',
      x: 'string | null',
      y: 'string | null'
    }),
    type({
      type: '"aggregate_count"',
      x: 'string | null'
    }),
    type({
      type: '"aggregate_count_unique"',
      x: 'string | null',
      y: 'string | null'
    }),
    type({
      type: '"custom"',
      columns: 'string[]',
      fn: 'string'
    })
  ),
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
  client: '"pg" | "sqlite3" | "mysql" | "oracledb" | "tedious"',
  details: {
    username: 'string',
    'password?': 'string',
    host: 'string',
    'port?': type.or('number | string.numeric.parse', type('""').pipe(() => undefined)),
    database: 'string'
  },
  charts: Chart.array()
})
export type Connection = typeof Connection.infer

export const Config = type({
  theme: type('"system" |  "light" | "dark"').default('system'),
  connections: Connection.array().default(() => [])
})
export type Config = typeof Config.infer
