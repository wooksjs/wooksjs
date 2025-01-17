import { extensions } from './extensions'

export function getMimeType(path: string, fallback: string | null = null): string | null {
  const ext: string = (/\.([^.]+)$/u.exec(path) || [])[1] || path
  return extensions[ext as keyof typeof extensions] || fallback
}
