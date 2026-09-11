// Keep the desktop package version in step with the app version.
//
// `VERSION` at the repository root is the single source of truth for the New
// API release (for example `v1.0.0-rc.36-custom.1`). electron-builder reads
// `package.json#version` for the installer metadata, so this script copies it
// across before every packaged build (`prebuild:*` hooks).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const versionFile = join(here, '..', 'VERSION')
const pkgFile = join(here, 'package.json')

const raw = readFileSync(versionFile, 'utf8').trim()
const version = raw.replace(/^v/, '')
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`sync-version: "${raw}" is not a usable semver, aborting`)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
if (pkg.version === version) {
  console.log(`sync-version: already at ${version}`)
} else {
  const previous = pkg.version
  pkg.version = version
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`sync-version: ${previous} -> ${version}`)
}
