export const DEFAULT_PORTAL_URL = 'https://portal.sqd.dev/datasets/ethereum-mainnet'

/**
 * Portal connection settings, shared by the indexer and the pool retriever.
 *
 * The public portal needs no credentials. `PORTAL_API_KEY` is for pointing the
 * squid at a private or self-hosted deployment instead.
 */
export function portalOptions(): {url: string; headers?: Record<string, string>} {
    const url = process.env.PORTAL_URL || DEFAULT_PORTAL_URL
    const key = process.env.PORTAL_API_KEY
    return key ? {url, headers: {'x-api-key': key}} : {url}
}
