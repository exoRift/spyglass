import type { Column } from 'knex-schema-inspector/dist/types/column'

export const TIME_UNITS = [
  'second',
  'minute',
  'hour',
  'day',
  'weekday',
  'week',
  'month',
  'year'
] as const

export const DEFAULT_BAR_COLOR = '#fb7085'

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

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  timeZone: 'UTC'
})
export function getWeekdayName (weekday: number): string {
  // 2024-01-07 was a Sunday
  const date = new Date(Date.UTC(2024, 0, 7 + weekday))

  return DATE_FORMATTER.format(date)
}
