import type { Column as KSIColumn } from 'knex-schema-inspector/dist/types/column'
import type { Table as KSITable } from 'knex-schema-inspector/dist/types/table'

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

export const DEFAULT_HEATMAP_COLORS = [
  '#ee6666',
  '#fac858',
  '#91cc75'
]

/**
 * Get the identifier for a column within the entire database
 * @param column The column
 * @returns      The identifier
 */
export function getColumnIdentifier (column: KSIColumn): string {
  let identifier = `${column.table}.${column.name}`
  if (column.schema) identifier = `${column.schema}.${identifier}`

  return identifier
}

/**
 * Given a column, get the most colloquial name possible that doesn't conflict with other columns
 * @param column  The column to get the name for
 * @param columns The collection of all columns
 * @returns       The column name
 */
export function getColumnNonConflictName (column: KSIColumn, columns: KSIColumn[]): string {
  const conflict = columns.find((columnB) => columnB.name === column.name && column !== columnB)
  const displayName = conflict
    ? conflict.table === column.table && column.schema
      ? `${column.schema}.${column.table}.${column.name}`
      : `${column.table}.${column.name}`
    : column.name

  return displayName
}

/**
 * Given a table, get the most colloquial name possible that doesn't conflict with other tables
 * @param table  The table to get the name for
 * @param tables The collection of all tables
 * @returns      The table name
 */
export function getTableNonConflictName (table: KSITable, tables: KSITable[]): string {
  const conflict = tables.find((t) => t.name === table.name && t !== table)
  const displayName = conflict
    ? table.schema
      ? `${table.schema}.${table.name}`
      : table.name
    : table.name

  return displayName
}

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  timeZone: 'UTC'
})
/**
 * Given a number 0-6, get the name of a weekday
 * @param weekday The weekday number
 * @returns       The weekday name
 */
export function getWeekdayName (weekday: number): string {
  // 2024-01-07 was a Sunday
  const date = new Date(Date.UTC(2024, 0, 7 + weekday))

  return DATE_FORMATTER.format(date)
}

export interface Column extends KSIColumn {
  identifier: string
}

export interface Table extends KSITable {
  identifier: string
  display_name: string
  columns: Column[]
}
