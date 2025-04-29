import './zlib-compressors'

import type { TBodyCompressor } from './body-compressor'
import { compressors } from './body-compressor'

export * from './body-compressor'

export function registerBodyCompressor(name: string, compressor: TBodyCompressor) {
  if (compressors[name]) {
    throw new Error(`Body compressor "${name}" already registered.`)
  }
  compressors[name] = compressor
}
