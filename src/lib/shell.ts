import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const GUI_SUBSYSTEM = 0x2
const CONSOLE_SUBSYSTEM = 0x3

/**
 * The Bun build `noConsole` parameter is currently broken. This function manually sets the GUI header
 * @see https://github.com/oven-sh/bun/issues/19916#issuecomment-3299059370
 * @param filePath  The path to the executable
 * @param subsystem The subsystem to set
 */
export async function setWindowsSubsystem (filePath: string, subsystem: 'gui' | 'console'): Promise<void> {
  const data = await fs.readFile(filePath)
  const buffer = Buffer.from(data)

  const peOffset = buffer.readUInt32LE(0x3C)
  const subsystemOffset = peOffset + 0x5C
  const currentSubsystem = buffer.readUInt16LE(subsystemOffset)

  if (currentSubsystem !== CONSOLE_SUBSYSTEM && currentSubsystem !== GUI_SUBSYSTEM) throw new Error(`Unexpected subsystem value: 0x${currentSubsystem.toString(16)}`)

  buffer.writeUInt16LE(subsystem === 'gui' ? GUI_SUBSYSTEM : CONSOLE_SUBSYSTEM, subsystemOffset)

  await fs.writeFile(filePath, buffer)
}

let CLONE_PATH: string | null = null

/**
 * On Windows, if the executable is GUI type, it doesn't return a stdout which the self-invocations rely on.\
 * Thus, for Windows, we have to clone the executable and change its header (gross)
 * @returns A usable executable path for self invocation
 */
export async function getExecutablePath (): Promise<string> {
  if (process.platform === 'win32') {
    if (CLONE_PATH) return CLONE_PATH
    else {
      const clonePath = path.resolve(os.tmpdir(), 'spyglass', 'spyglass-console.exe')
      await fs.mkdir(path.resolve(os.tmpdir(), 'spyglass'))
      await fs.copyFile(process.execPath, clonePath)
      await setWindowsSubsystem(clonePath, 'console')
      CLONE_PATH = clonePath
      return clonePath
    }
  } else return process.execPath
}
