export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
export const MULTICALL_ADDRESS = '0x5ba1e12693dc8f9c48aad8770482f4739beed696'

export const FACTORY_ADDRESS = '0x1f98431c8ad98523631ae4a59f267346ea31f984'
export const FACTORY_DEPLOYED_AT = 12369621

export const POSITIONS_ADDRESS = '0xc36442b4a4522e871399cd717abdd847ab11fe88'
export const POSITIONS_DEPLOYED_AT = 12369651

export const MULTICALL_PAGE_SIZE = 100

/**
 * Portal caps a single query at 256 KB of JSON. An EVM address costs ~46 bytes
 * once quoted and comma-separated, and the SDK unions the address lists of all
 * same-range requests into one filter before sending, so this is a budget for
 * the whole pass rather than for one addLog() call.
 *
 * A bare address filter tops out at ~5,690 addresses. The passes also carry the
 * four pool event topics and a field selection, and pass 0 additionally carries
 * the factory and position-manager filters, so this leaves headroom rather than
 * sitting on the measured ceiling: going over is a hard `Query is too large`
 * from the portal, not a slow query.
 */
export const MAX_ADDRESSES_PER_PASS = 5_000

/**
 * Blocks below the chain head whose pool registrations are re-read from the
 * database on every batch. Anything deeper than this is final, so the in-memory
 * registry may cache it; anything shallower may still be orphaned by a fork.
 * Must be >= the finality confirmation used by the data source.
 */
export const POOL_REGISTRY_REORG_DEPTH = 100
