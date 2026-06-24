import pkg from '../../package.json'

/**
 * Construct a link for reporting errors
 * @param prefix The issue prefix
 * @param err    The error to report
 * @returns      The link
 */
export function constructReportLink (prefix: string, err: any): string {
  const builder = new URL('issues/new', pkg.homepage + '/')

  const msg = err instanceof Error ? err.message : err.toString()

  let body = '*A description of what happened...*'
  if (err instanceof Error) body += `\n\n## Name\n\`${err.name}\``
  body += `\n\n## Message\n\`\`\`\n${msg}\n\`\`\``
  if (err instanceof Error && err.stack) body += `\n\n## Stack\n\`\`\`\n${err.stack}\n\`\`\``
  if (err instanceof Error && err.cause) body += `\n\n## Cause\n${stringifyError(err.cause)}`

  builder.searchParams.set('title', `${prefix}: ${msg}`)
  builder.searchParams.set('body', body)

  return builder.toString()
}

/**
 * Stringify an error for transport to the webview (can't serialize Error instances)
 * @param err The error
 * @returns   The string representation
 */
export function stringifyError (err: unknown): string {
  if (err instanceof Error) {
    if (err.cause) return `${err.message} (${stringifyError(err.cause)})`
    else return err.message
    // @ts-expect-error
  } else if (typeof err === 'object' && 'message' in err) return err.message
  else if (!err) return String(err)
  else return err.toString() // eslint-disable-line @typescript-eslint/no-base-to-string
}
