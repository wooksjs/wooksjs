
export type TBodyCompressor = {
    compress: (data: string) => string | Promise<string>
    uncompress: (data: string) => string | Promise<string>
}

export const compressors: Record<string, TBodyCompressor> = {
    identity: {
        compress: v => v,
        uncompress: v => v,
    },
}

export async function compressBody(encodings: string[], body: string): Promise<string> {
    let newBody = body
    for (const e of encodings) {
        if (!compressors[e]) {
            throw new Error(`Unsupported compression type "${e}".`)
        }
        newBody = await compressors[e].compress(body)
    }
    return newBody
}

export async function uncompressBody(encodings: string[], body: string): Promise<string> {
    let newBody = body
    for (const e of encodings.reverse()) {
        if (!compressors[e]) {
            throw new Error(`Usupported compression type "${e}".`)
        }
        newBody = await compressors[e].uncompress(body)
    }
    return newBody
}
