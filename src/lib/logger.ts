import util from 'util'

export function info (...args: any[]): void {
  return console.info(util.styleText('blueBright', 'INFO'), ...args)
}

export function warn (...args: any[]): void {
  return console.warn(util.styleText('yellow', 'WARN'), ...args)
}

export function error (...args: any[]): void {
  return console.error(util.styleText('redBright', 'ERROR'), ...args)
}

export function debug (...args: any[]): void {
  return console.debug(util.styleText('greenBright', 'DEBUG'), ...args) // eslint-disable-line no-console
}
