import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { builtinModules } from 'module'
import path from 'path'

export function getExternals(ws) {
  const pkgPath = getWorkspacePath(ws ? `packages/${ws}/package.json` : 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath))

  // Take dependencies from package.json, fallback to empty object if missing
  const deps = Object.keys(pkg.dependencies ?? {})
  const devDeps = Object.keys(pkg.devDependencies ?? {})
  const peerDeps = Object.keys(pkg.peerDependencies ?? {})

  // Combine dependencies and built-in Node.js modules
  return [...deps, ...devDeps, ...peerDeps, ...builtinModules, ...builtinModules.map(mod => `node:${mod}`)]
}

export function getWorkspacePath(target) {
  return path.resolve(process.cwd(), target)
}

export function getWorkspaceFolders() {
  const packagesPath = getWorkspacePath('packages')

  if (!existsSync(packagesPath)) {
    return []
  }

  return readdirSync(packagesPath).filter(item => {
    const fullPath = path.join(packagesPath, item)
    return statSync(fullPath).isDirectory()
  })
}
