import fs from 'fs/promises'
import { execSync } from 'child_process'
import path from 'path'
import { build } from 'vite'
import toIco from 'to-ico'
import { styleText } from 'util'

import pkg from '../package.json'

// TODO: switch build script to use --production --keep-names when https://github.com/oven-sh/bun/issues/12304 is fixed

// ========= DEFINITIONS =========

const ICON_PATH = path.resolve(import.meta.dirname, '../src/assets/logo.png')
const ICON_SIZES = [16, 32, 48, 64, 128, 256]

async function getResizedIcons (sourceFile: string, sizes: number[]): Promise<Buffer[]> {
  const img = Bun.file(sourceFile).image()

  const buffers: Buffer[] = []

  for (const size of sizes) {
    const resized = img.resize(size, size)

    const png = resized.png()
    buffers.push(await png.buffer())
  }

  return buffers
}

function exec (cmd: string): void {
  execSync(cmd, { stdio: 'inherit' })
}

async function createMacApp ({
  appName,
  binaryPath,
  bundleId,
  version,
  outDir,
  signIdentity
}: {
  appName: string
  binaryPath: string
  bundleId: string
  version: string
  outDir: string
  signIdentity?: string
}): Promise<void> {
  const appPath = path.resolve(outDir, `${appName}.app`)
  const contentsPath = path.resolve(appPath, 'Contents')
  const macosPath = path.resolve(contentsPath, 'MacOS')
  const resourcesPath = path.resolve(contentsPath, 'Resources')

  await fs.mkdir(macosPath, { recursive: true })
  await fs.mkdir(resourcesPath, { recursive: true })

  const execName = appName
  const destBinary = path.resolve(macosPath, execName)

  await fs.copyFile(path.resolve(binaryPath), destBinary)
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${appName}</string>

  <key>CFBundleDisplayName</key>
  <string>${appName}</string>

  <key>CFBundleIdentifier</key>
  <string>${bundleId}</string>

  <key>CFBundleExecutable</key>
  <string>${execName}</string>

  <key>CFBundlePackageType</key>
  <string>APPL</string>

  <key>CFBundleVersion</key>
  <string>${version}</string>

  <key>CFBundleShortVersionString</key>
  <string>${version}</string>

  <key>CFBundleIconFile</key>
  <string>${appName}.icns</string>

  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
</dict>
</plist>`

  await fs.writeFile(path.resolve(contentsPath, 'Info.plist'), plist)

  const sourceIcon = ICON_PATH

  const iconsetPath = path.resolve(outDir, `${appName}.iconset`)
  await fs.mkdir(iconsetPath, { recursive: true })

  const baseSizes = ICON_SIZES
  const retinaSizes = ICON_SIZES.map((s) => s * 2)

  const baseBuffers = await getResizedIcons(sourceIcon, baseSizes)
  const retinaBuffers = await getResizedIcons(sourceIcon, retinaSizes)

  for (let i = 0; i < baseSizes.length; i++) {
    const s = baseSizes[i]
    const baseName = `icon_${s}x${s}.png`
    const retinaName = `icon_${s}x${s}@2x.png`

    await fs.writeFile(path.resolve(iconsetPath, baseName), baseBuffers[i]!)
    await fs.writeFile(path.resolve(iconsetPath, retinaName), retinaBuffers[i]!)
  }

  const icnsOut = path.resolve(resourcesPath, `${appName}.icns`)
  exec(`iconutil -c icns "${iconsetPath}" -o "${icnsOut}"`)

  await fs.rm(iconsetPath, { recursive: true })
  console.info(styleText('blue', 'Mac iconset created'))

  if (signIdentity) exec(`codesign --deep --force --options runtime --sign "${signIdentity}" "${appPath}"`)
  else exec(`codesign --deep --force --sign - "${appPath}"`)

  exec(`codesign --verify --deep --strict --verbose=2 "${appPath}"`)
}

async function createIco ({
  sourceFile,
  outFile
}: {
  sourceFile: string
  outFile: string
}): Promise<void> {
  const buffers = await getResizedIcons(sourceFile, ICON_SIZES)

  const icoBuffer = await toIco(buffers)

  await fs.writeFile(outFile, icoBuffer)
}

const iconPromise = process.platform === 'win32'
  ? createIco({
    sourceFile: ICON_PATH,
    outFile: path.resolve(import.meta.dirname, '../build/icon.ico')
  })
    .catch((err) => {
      console.error(styleText('red', 'Failed to create Windows .ico file'), err)
      process.exit(1)
    })
    .then(() => console.info(styleText('blue', 'Windows .ico file created')))
  : Promise.resolve()

// ========= LOGIC =========

const viewPromise = build({
  root: path.resolve(import.meta.dirname, '../src/view')
})
  .catch((err) => {
    console.error(styleText('red', 'Failed to build view'), err)
    process.exit(1)
  })
  .then(() => console.info(styleText('green', 'View built')))

await iconPromise
await viewPromise

const result = await Bun.build({
  entrypoints: ['src/index.ts'],

  external: [
    'data-forge',
    'vite',
    'pg',
    'pg-query-stream',
    'sqlite3',
    'better-sqlite3',
    'mysql',
    'mysql2',
    'tedious',
    'oracledb'
  ],

  define: {
    'process.env.NODE_ENV': '"production"'
  },

  minify: {
    whitespace: true,
    syntax: true
  },

  // @ts-expect-error
  keepNames: true, // Required for Knex client identification

  sourcemap: 'external',

  compile: {
    autoloadPackageJson: true,
    execArgv: ['--console-depth=100', '--no-orphans'],
    outfile: 'build/spyglass',
    windows: process.platform === 'win32'
      ? {
        hideConsole: true,
        icon: path.resolve(import.meta.dirname, '../build/icon.ico')
      }
      : undefined
  }
})
  .catch((err) => {
    console.error(styleText('red', 'Failed to build executable'), err)
    process.exit(1)
  })

if (!result.success) {
  console.error(styleText('red', 'Failed to build executable'), result.logs)
  process.exit(1)
}

console.info(styleText('green', 'Executable built'))

if (process.platform === 'darwin') {
  await createMacApp({
    appName: 'Spyglass',
    binaryPath: path.resolve(import.meta.dirname, '../build/spyglass'),
    bundleId: 'com.github.exoRift.spyglass',
    version: pkg.version,
    signIdentity: undefined,
    outDir: path.resolve(import.meta.dirname, '../build')
  })
    .catch((err) => {
      console.error(styleText('red', 'Failed to build Mac .app bundle'), err)
      process.exit(1)
    })

  console.info(styleText('blue', 'Mac .app bundle built'))
}

await fs.rm(path.resolve(import.meta.dirname, '../src/view/dist'), { recursive: true })
