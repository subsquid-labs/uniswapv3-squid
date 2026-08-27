/**
 * Level 1 of the entity pipeline: the Tokens and Pools every later level
 * refers to.
 *
 * `PoolCreated` is the only place a Pool or a Token can come from, so this runs
 * before anything else in the batch and leaves both tables complete for the
 * rest of it. The whole level is one load of what the batch's factory logs
 * mention, one pass over those logs in chain order, and one bulk contract read
 * for the metadata of the tokens that turned out to be new - no entity is
 * fetched, and no token is read from the chain, in the middle of the loop.
 */
import {assertNotNull} from '@subsquid/util-internal'
import {Bundle, Factory, Pool, Token} from '../model'
import type {Context} from '../processor'
import {ADDRESS_ZERO, FACTORY_ADDRESS} from '../utils/constants'
import type {Entities} from '../utils/entities'
import {WHITELIST_TOKENS} from '../utils/pricing'
import {fetchTokensDecimals, fetchTokensName, fetchTokensSymbol, fetchTokensTotalSupply} from '../utils/token'
import type {PoolCreatedEvent} from './extract'

export async function createPoolsAndTokens(
    ctx: Context,
    entities: Entities,
    events: PoolCreatedEvent[]
): Promise<void> {
    if (events.length === 0) return

    // Load step. Both tokens of a new pool may already exist - most pools are
    // created against a token some earlier pool already introduced.
    const tokenIds = new Set<string>()
    for (const event of events) {
        tokenIds.add(event.token0Id)
        tokenIds.add(event.token1Id)
    }

    await entities.load(Bundle, ['1'])
    await entities.load(Factory, [FACTORY_ADDRESS])
    await entities.load(Token, tokenIds)

    if (entities.get(Bundle, '1') == null) {
        entities.set(createBundle('1'))
    }

    let factory = entities.get(Factory, FACTORY_ADDRESS)
    if (factory == null) {
        factory = createFactory(FACTORY_ADDRESS)
    }

    // Tokens created in this batch, and so the only ones whose metadata is not
    // in the database yet.
    const newTokens: Token[] = []

    for (const event of events) {
        const pool = createPool(event.poolId, event.token0Id, event.token1Id)
        pool.feeTier = event.fee
        pool.createdAtTimestamp = new Date(event.timestamp)
        pool.createdAtBlockNumber = event.blockNumber

        entities.set(pool)
        factory.poolCount++

        let token0 = entities.get(Token, pool.token0Id)
        if (token0 == null) {
            token0 = createToken(pool.token0Id)
            newTokens.push(token0)
        }

        let token1 = entities.get(Token, pool.token1Id)
        if (token1 == null) {
            token1 = createToken(pool.token1Id)
            newTokens.push(token1)
        }

        // update whitelisted pools
        if (WHITELIST_TOKENS.includes(token0.id)) token1.whitelistPools.push(pool.id)
        if (WHITELIST_TOKENS.includes(token1.id)) token0.whitelistPools.push(pool.id)

        entities.set(token0)
        entities.set(token1)
    }

    entities.set(factory)

    // One multicall per field for the whole batch, at a single height, rather
    // than four calls per token.
    await syncTokens(events[events.length - 1].blockNumber, newTokens)
}

function createFactory(id: string) {
    const factory = new Factory({id})
    factory.poolCount = 0
    factory.totalVolumeETH = 0
    factory.totalVolumeUSD = 0
    factory.untrackedVolumeUSD = 0
    factory.totalFeesUSD = 0
    factory.totalFeesETH = 0
    factory.totalValueLockedETH = 0
    factory.totalValueLockedUSD = 0
    factory.totalValueLockedUSDUntracked = 0
    factory.totalValueLockedETHUntracked = 0
    factory.txCount = 0
    factory.owner = ADDRESS_ZERO

    return factory
}

function createToken(id: string) {
    const token = new Token({id})
    token.symbol = 'unknown'
    token.name = 'unknown'
    token.totalSupply = 0n
    token.decimals = 0
    token.derivedETH = 0
    token.volume = 0
    token.volumeUSD = 0
    token.feesUSD = 0
    token.untrackedVolumeUSD = 0
    token.totalValueLocked = 0
    token.totalValueLockedUSD = 0
    token.totalValueLockedUSDUntracked = 0
    token.txCount = 0
    token.poolCount = 0n
    token.whitelistPools = []

    return token
}

function createBundle(id: string) {
    const bundle = new Bundle({id})
    bundle.ethPriceUSD = 0

    return bundle
}

function createPool(id: string, token0Id: string, token1Id: string) {
    const pool = new Pool({id})

    pool.token0Id = token0Id
    pool.token1Id = token1Id
    pool.feeTier = 0
    pool.liquidityProviderCount = 0n
    pool.txCount = 0
    pool.liquidity = 0n
    pool.sqrtPrice = 0n
    pool.feeGrowthGlobal0X128 = 0n
    pool.feeGrowthGlobal1X128 = 0n
    pool.token0Price = 0
    pool.token1Price = 0
    pool.observationIndex = 0n
    pool.totalValueLockedToken0 = 0
    pool.totalValueLockedToken1 = 0
    pool.totalValueLockedUSD = 0
    pool.totalValueLockedETH = 0
    pool.totalValueLockedUSDUntracked = 0
    pool.volumeToken0 = 0
    pool.volumeToken1 = 0
    pool.volumeUSD = 0
    pool.feesUSD = 0
    pool.untrackedVolumeUSD = 0

    pool.collectedFeesToken0 = 0
    pool.collectedFeesToken1 = 0
    pool.collectedFeesUSD = 0

    return pool
}

async function syncTokens(height: number, tokens: Token[]): Promise<void> {
    if (tokens.length === 0) return

    const ids = tokens.map((t) => t.id)

    const [symbols, names, totalSupplies, decimals] = await Promise.all([
        fetchTokensSymbol(height, ids),
        fetchTokensName(height, ids),
        fetchTokensTotalSupply(height, ids),
        fetchTokensDecimals(height, ids),
    ])

    for (const token of tokens) {
        token.symbol = assertNotNull(symbols.get(token.id))
        token.name = assertNotNull(names.get(token.id))
        token.totalSupply = assertNotNull(totalSupplies.get(token.id))
        token.decimals = assertNotNull(decimals.get(token.id))
    }
}
