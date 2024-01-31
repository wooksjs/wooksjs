import path from 'path'

export function normalizePath(filePath: string, baseDir?: string) {
  return path.normalize(
    path.join(
      filePath.startsWith('/') || (baseDir && baseDir.startsWith('/')) ? '' : process.cwd(),
      baseDir || '',
      filePath
    )
  )
}
