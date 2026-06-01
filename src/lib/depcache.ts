import path from 'path'

/**
 * Change the current working directory to the global module cache
 */
export async function changecwd () { // eslint-disable-line @typescript-eslint/explicit-function-return-type
  if (process.env.NODE_ENV === 'production') {
    const old = process.cwd()
    process.chdir(path.resolve((await Bun.$`bun pm -g cache`.quiet()).text(), '../global'))

    return {
      [Symbol.dispose]: () => process.chdir(old)
    }
  } else {
    return {
      [Symbol.dispose]: () => {}
    }
  }
}
