import path from 'path'
import fs from 'fs/promises'
import Module from 'module'

import * as logger from './logger'

/**
 * Change the current working directory to the global module cache
 */
export async function changecwd () { // eslint-disable-line @typescript-eslint/explicit-function-return-type
  if (process.env.NODE_ENV === 'production') {
    const oldDir = process.cwd()
    const globalDirPromise = Bun.$`BUN_BE_BUN=1 ${process.execPath} pm -g cache`
      .quiet()
      .then((res) => res.text())
      .catch((err) => {
        if (err instanceof Bun.$.ShellError) {
          const givenPath = err.stderr.toString().match(/"([^"]+?)"/)?.[1]

          if (!givenPath) throw new Error('Could not extrapolate would-be global module store from error', { cause: err })

          logger.info('Bun not detected. Creating global module store at:', givenPath)

          return fs.mkdir(givenPath, { recursive: true })
            .then(() => Bun.file(path.resolve(givenPath, 'package.json')).write('{}'))
            .then(() => givenPath)
        } else throw err
      })

    const globalDir = path.resolve(await globalDirPromise, '../global')
    process.chdir(globalDir)
    logger.info('Changing CWD to:', globalDir)

    return {
      [Symbol.dispose]: () => {
        process.chdir(oldDir)
        logger.info('Reverting CWD to:', oldDir)
      }
    }
  } else {
    return {
      [Symbol.dispose]: () => {}
    }
  }
}

const RESOLVE_OVERRIDES = new Map<string, string>()

const originalResolve = (Module as any)._resolveFilename.bind(Module)
;(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (RESOLVE_OVERRIDES.has(request)) {
    return RESOLVE_OVERRIDES.get(request)!
  }
  return originalResolve(request, parent, isMain, options)
}

async function getRealPath (specifier: string): Promise<string> {
  return (await Bun.$`BUN_BE_BUN=1 ${process.execPath} -p "require.resolve('${specifier}')"`.quiet(true)).text().trim()
}

export async function manuallyResolveModule (specifier: string): Promise<void> {
  let attempts = 0

  while (true) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    if (attempts++ > 50) throw new Error(`Gave up resolving ${specifier}`)

    if (!RESOLVE_OVERRIDES.has(specifier)) {
      const realPath = await getRealPath(specifier)
      RESOLVE_OVERRIDES.set(specifier, realPath)
    }

    const realPath = RESOLVE_OVERRIDES.get(specifier)!

    const cacheKeysBefore = new Set(Object.keys(require.cache))

    try {
      require(realPath)
      return
    } catch (err) {
      if (!(err instanceof ResolveMessage)) throw new Error('Non-ResolveMessage error thrown', { cause: err })

      const subspecifier = err.message.match(/Cannot find (?:package|module) '(.+?)'/)?.[1]
      if (!subspecifier) throw new Error('Unable to parse module name from error message', { cause: err })

      // Purge anything that was added to the cache during this failed attempt.
      // These entries may hold stale circular-dep references to modules that
      // were subsequently removed from cache by Node on failure.
      for (const key of Object.keys(require.cache)) {
        if (!cacheKeysBefore.has(key)) {
          delete require.cache[key]
        }
      }

      const subRealPath = await getRealPath(subspecifier)
      RESOLVE_OVERRIDES.set(subspecifier, subRealPath)
    }
  }
}
