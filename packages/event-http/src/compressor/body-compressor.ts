/* eslint-disable func-names */
// https://nodejs.org/docs/latest-v16.x/api/zlib.html#zlib
export interface TBodyCompressor {
  compress: (data: Buffer) => Buffer | Promise<Buffer>
  uncompress: (data: Buffer) => Buffer | Promise<Buffer>
  stream?: {
    compress: (
      data: AsyncIterable<Buffer> // do we really need AsyncIterable? Maybe just Buffer?
    ) => AsyncIterable<Buffer> | Promise<AsyncIterable<Buffer>>
    uncompress: (
      data: AsyncIterable<Buffer> // do we really need AsyncIterable? Maybe just Buffer?
    ) => AsyncIterable<Buffer> | Promise<AsyncIterable<Buffer>>
  }
}

export const compressors: Record<string, TBodyCompressor | undefined> = {
  identity: {
    compress: v => v,
    uncompress: v => v,
    stream: {
      compress: (data: AsyncIterable<Buffer>) => data,
      uncompress: (data: AsyncIterable<Buffer>) => data,
    },
  },
}

export function encodingSupportsStream(encodings: string[]) {
  return encodings.every(enc => compressors[enc]?.stream)
}

export async function compressBody(encodings: string[], body: Buffer): Promise<Buffer> {
  let buf = body
  for (const enc of encodings) {
    const c = compressors[enc]
    if (!c) {
      throw new Error(`Unsupported compression type "${enc}".`)
    }
    buf = await c.compress(buf) // use *current* buffer
  }
  return buf
}

export async function uncompressBody(encodings: string[], compressed: Buffer): Promise<Buffer> {
  let buf = compressed // progressive buffer

  // Decompress in reverse order: br, gzip  =>  gunzip, brotlidec
  for (const enc of encodings.slice().reverse()) {
    const c = compressors[enc]
    if (!c) {
      throw new Error(`Unsupported compression type "${enc}".`)
    }

    buf = await c.uncompress(buf)
  }

  return buf
}

export async function compressBodyStream(
  encodings: string[],
  src: AsyncIterable<Buffer>
): Promise<AsyncIterable<Buffer>> {
  if (!encodingSupportsStream(encodings)) {
    throw new Error('Some encodings lack a streaming compressor')
  }

  let out: AsyncIterable<Buffer> = src
  for (const enc of encodings) {
    out = await compressors[enc]!.stream!.compress(out)
  }
  return out
}

export async function uncompressBodyStream(
  encodings: string[],
  src: AsyncIterable<Buffer>
): Promise<AsyncIterable<Buffer>> {
  if (!encodingSupportsStream(encodings)) {
    throw new Error('Some encodings lack a streaming decompressor')
  }

  let out: AsyncIterable<Buffer> = src
  for (const enc of Array.from(encodings).reverse()) {
    out = await compressors[enc]!.stream!.uncompress(out)
  }
  return out
}
