export interface TBodyCompressor {
  compress: (data: string) => string | Promise<string>
  uncompress: (data: string) => string | Promise<string>
}

export const compressors: Record<string, TBodyCompressor | undefined> = {
  identity: {
    compress: v => v,
    uncompress: v => v,
  },
}

export async function compressBody(encodings: string[], body: string): Promise<string> {
  let newBody = body
  for (const e of encodings) {
    const cmp = compressors[e]
    if (!cmp) {
      throw new Error(`Unsupported compression type "${e}".`)
    }
    newBody = await cmp.compress(body)
  }
  return newBody
}

export async function uncompressBody(encodings: string[], body: string): Promise<string> {
  let newBody = body
  for (const e of encodings.reverse()) {
    const cmp = compressors[e]
    if (!cmp) {
      throw new Error(`Usupported compression type "${e}".`)
    }
    newBody = await cmp.uncompress(body)
  }
  return newBody
}
