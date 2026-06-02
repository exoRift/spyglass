import path from 'path'
import fs from 'fs/promises'

import * as logger from './logger'

declare global {
  // eslint-disable-next-line no-var
  var _BUN_EXISTENCE_CHECKED: boolean | undefined
}

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

          if (!givenPath) throw new Error('Could not extrapolate would-be global module store from error')

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
