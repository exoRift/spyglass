import util from 'util'

export function info (...args: any[]): null {
  console.info(util.styleText('blueBright', 'INFO'), ...args)
  return null
}

export function warn (...args: any[]): null {
  console.warn(util.styleText('yellow', 'WARN'), ...args)
  return null
}

export function error (...args: any[]): null {
  console.error(util.styleText('redBright', 'ERROR'), ...args)
  return null
}

export function debug (...args: any[]): null {
  console.debug(util.styleText('greenBright', 'DEBUG'), ...args) // eslint-disable-line no-console
  return null
}
