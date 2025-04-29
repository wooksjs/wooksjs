/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable unicorn/no-await-expression-member */
/* eslint-disable require-atomic-updates */
/* eslint-disable @typescript-eslint/consistent-type-imports */

import { pipeline as _pipeline, Readable } from 'node:stream'
import { promisify } from 'node:util'
import {
  createBrotliCompress,
  createBrotliDecompress,
  createDeflate,
  createGunzip,
  createGzip,
  createInflate,
} from 'node:zlib'

import { compressors } from './body-compressor'

const pipeline = _pipeline

/* ------------------------------------------------------------
   Helper: wrap any AsyncIterable<Buffer> as a Node Readable
------------------------------------------------------------- */
function iterableToReadable(src: AsyncIterable<Buffer>): Readable {
  return Readable.from(src, { objectMode: false })
}

/* ---------- helper types ---------------------------------- */
type DestroyableStream = NodeJS.ReadWriteStream & {
  destroy: (error?: Error) => void
}

/* ---------- pump ------------------------------------------ */
function pump(
  src: AsyncIterable<Buffer>,
  transform: DestroyableStream // <- destroy guaranteed
): AsyncIterable<Buffer> {
  // start the pipe in background; ignore its promise
  pipeline(iterableToReadable(src), transform, (err: unknown) => {
    if (err) {
      transform.destroy(err as Error)
    }
  })
  return transform as unknown as AsyncIterable<Buffer>
}

/* ------------------------------------------------------------
   Attach streaming handlers for each codec
------------------------------------------------------------- */
function addStreamCodec(
  name: 'gzip' | 'deflate' | 'br',
  createDeflater: () => DestroyableStream,
  createInflater: () => DestroyableStream
) {
  const c = compressors[name] ?? (compressors[name] = { compress: v => v, uncompress: v => v })

  c.stream = {
    compress: async src => pump(src, createDeflater()),
    uncompress: async src => pump(src, createInflater()),
  }
}

/* gzip ------------------------------------------------------ */
addStreamCodec('gzip', createGzip, createGunzip)

/* deflate --------------------------------------------------- */
addStreamCodec('deflate', createDeflate, createInflate)

/* brotli ---------------------------------------------------- */
addStreamCodec('br', createBrotliCompress, createBrotliDecompress)

/* ------------------------------------------------------------
   Promise-style buffer helpers (unchanged)
------------------------------------------------------------- */

interface PZlib {
  gzip: (b: Buffer) => Promise<Buffer>
  gunzip: (b: Buffer) => Promise<Buffer>
  deflate: (b: Buffer) => Promise<Buffer>
  inflate: (b: Buffer) => Promise<Buffer>
  brotliCompress: (b: Buffer) => Promise<Buffer>
  brotliDecompress: (b: Buffer) => Promise<Buffer>
}

let zp: PZlib | undefined
async function zlib(): Promise<PZlib> {
  if (!zp) {
    const { gzip, gunzip, deflate, inflate, brotliCompress, brotliDecompress } = await import(
      'node:zlib'
    )

    zp = {
      gzip: promisify(gzip),
      gunzip: promisify(gunzip),
      deflate: promisify(deflate),
      inflate: promisify(inflate),
      brotliCompress: promisify(brotliCompress),
      brotliDecompress: promisify(brotliDecompress),
    }
  }
  return zp
}

/* buffer-oriented API -------------------------------------- */
compressors.gzip!.compress = async b => (await zlib()).gzip(b)
compressors.gzip!.uncompress = async b => (await zlib()).gunzip(b)

compressors.deflate!.compress = async b => (await zlib()).deflate(b)
compressors.deflate!.uncompress = async b => (await zlib()).inflate(b)

compressors.br!.compress = async b => (await zlib()).brotliCompress(b)
compressors.br!.uncompress = async b => (await zlib()).brotliDecompress(b)
