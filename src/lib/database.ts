import type { Knex } from 'knex'

import type { TIME_UNITS } from './constants'

/**
 * Returns an expression suitable for SELECT/GROUP BY/ORDER BY.
 *
 * For second/minute/hour/day/month/year:
 *   returns a truncated timestamp/date.
 *
 * For weekday:
 *   returns an integer 0-6 where:
 *     0 = Sunday
 *     1 = Monday
 *     ...
 *     6 = Saturday
 */
export function dateBucket (
  knex: Knex,
  unit: typeof TIME_UNITS[number],
  column: string | Knex.Raw
): Knex.Raw {
  const client = knex.client.config.client

  switch (client) {
    case 'pg':
    case 'postgres':
    case 'postgresql':
    case 'redshift': {
      if (unit === 'weekday') {
        return knex.raw('EXTRACT(DOW FROM ??)::integer', [column])
      }

      return knex.raw('date_trunc(?, ??)', [unit, column])
    }

    case 'mysql':
    case 'mysql2': {
      if (unit === 'weekday') {
        return knex.raw('DAYOFWEEK(??) - 1', [column])
      }

      if (unit === 'week') {
        return knex.raw(
          'STR_TO_DATE(DATE_FORMAT(DATE_SUB(??, INTERVAL (DAYOFWEEK(??) - 1) DAY), ?), \'%Y-%m-%d %H:%i:%s\')',
          [column, column, '%Y-%m-%d 00:00:00']
        )
      }

      const formats = {
        year: '%Y-01-01 00:00:00',
        month: '%Y-%m-01 00:00:00',
        day: '%Y-%m-%d 00:00:00',
        hour: '%Y-%m-%d %H:00:00',
        minute: '%Y-%m-%d %H:%i:00',
        second: '%Y-%m-%d %H:%i:%s',
        week: '%Y-%m-%d 00:00:00'
      } satisfies Record<Exclude<typeof TIME_UNITS[number], 'weekday'>, string>

      return knex.raw(
        'STR_TO_DATE(DATE_FORMAT(??, ?), \'%Y-%m-%d %H:%i:%s\')',
        [column, formats[unit]]
      )
    }

    case 'mssql':
    case 'tedious': {
      if (unit === 'weekday') {
        return knex.raw(
          '((DATEPART(WEEKDAY, ?) + @@DATEFIRST - 2) % 7)',
          [column]
        )
      }

      switch (unit) {
        case 'week':
          return knex.raw(
            'DATEADD(day, -((DATEPART(WEEKDAY, ?) + @@DATEFIRST - 2) % 7), DATEADD(day, DATEDIFF(day, 0, ?), 0))',
            [column, column]
          )

        case 'year':
          return knex.raw(
            'DATEFROMPARTS(YEAR(?), 1, 1)',
            [column]
          )

        case 'month':
          return knex.raw(
            'DATEFROMPARTS(YEAR(?), MONTH(?), 1)',
            [column, column]
          )

        case 'day':
          return knex.raw(
            'DATEADD(day, DATEDIFF(day, 0, ?), 0)',
            [column]
          )

        case 'hour':
          return knex.raw(
            'DATEADD(hour, DATEDIFF(hour, 0, ?), 0)',
            [column]
          )

        case 'minute':
          return knex.raw(
            'DATEADD(minute, DATEDIFF(minute, 0, ?), 0)',
            [column]
          )

        case 'second':
          return knex.raw(
            'DATEADD(second, DATEDIFF(second, 0, ?), 0)',
            [column]
          )
      }

      break
    }

    case 'oracledb': {
      if (unit === 'weekday') {
        return knex.raw(
          "MOD(TRUNC(??) - DATE '1900-01-07', 7)",
          [column]
        )
      }

      switch (unit) {
        case 'week':
          return knex.raw("TRUNC(??, 'IW')", [column])

        case 'year':
          return knex.raw("TRUNC(??, 'YEAR')", [column])

        case 'month':
          return knex.raw("TRUNC(??, 'MONTH')", [column])

        case 'day':
          return knex.raw('TRUNC(??)', [column])

        case 'hour':
          return knex.raw(
            "TRUNC(??, 'HH24')",
            [column]
          )

        case 'minute':
          return knex.raw(
            "TRUNC(??, 'MI')",
            [column]
          )

        case 'second':
          return knex.raw(
            `CAST(
              TO_CHAR(??, 'YYYY-MM-DD HH24:MI:SS')
              AS TIMESTAMP
            )`,
            [column]
          )
      }

      break
    }
  }

  if (knex.client.dialect === 'sqlite3') {
    if (unit === 'weekday') {
      return knex.raw('CAST(strftime(\'%w\', ??) AS INTEGER)', [column])
    }

    if (unit === 'week') {
      return knex.raw(
        "datetime(date(??, '-' || strftime('%w', ??) || ' days'))",
        [column, column]
      )
    }

    const formats = {
      year: '%Y-01-01 00:00:00',
      month: '%Y-%m-01 00:00:00',
      day: '%Y-%m-%d 00:00:00',
      hour: '%Y-%m-%d %H:00:00',
      minute: '%Y-%m-%d %H:%M:00',
      second: '%Y-%m-%d %H:%M:%S',
      week: '%Y-%m-%d 00:00:00'
    } satisfies Record<Exclude<typeof TIME_UNITS[number], 'weekday'>, string>

    return knex.raw(
      'datetime(strftime(?, ??))',
      [formats[unit], column]
    )
  }

  throw new Error(`Unsupported client: ${client}`)
}
