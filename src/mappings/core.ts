/**
 * Level 2 of the entity pipeline: pool state, ticks, the mint/burn/swap history
 * and the day/hour rollups derived from them.
 *
 * The events arrive already decoded, already address-filtered and in chain
 * order, so this module never looks at a log. It runs in three steps:
 *
 *   1. `load()` walks the batch once and states every id it is going to need,
 *      then fetches each entity class in one query. Nothing below it touches
 *      the database.
 *   2. the per-event math, which only reads what step 1 put in memory.
 *   3. one multicall round per batch for the fee-growth accumulators, which
 *      are chain state rather than log data.
 *
 * Persistence belongs to main.ts, so every entity that is mutated here has to
 * be handed back to `entities.set()` - reading one through `get()` does not
 * mark it dirty.
 */
import {BigDecimal} from '@subsquid/big-decimal'
import {Multicall} from '../abi/multicall'
import * as poolAbi from '../abi/pool'
import {
    Bundle,
    Burn,
    EthPrice,
    Factory,
    Mint,
    Pool,
    PoolDayData,
    PoolHourData,
    Swap,
    Tick,
    TickDayData,
    Token,
    TokenDayData,
    TokenHourData,
    Tx,
    UniswapDayData,
} from '../model'
import type {Context, Phase} from '../processor'
import {safeDiv} from '../utils'
import {FACTORY_ADDRESS, MULTICALL_ADDRESS, MULTICALL_PAGE_SIZE} from '../utils/constants'
import type {Entities} from '../utils/entities'
import {
    createPoolDayData,
    createPoolHourData,
    createTickDayData,
    createTokenDayData,
    createTokenHourData,
    createUniswapDayData,
    getDayIndex,
    getHourIndex,
    snapshotId,
} from '../utils/intervalUpdates'
import {
    getTrackedAmountUSD,
    MINIMUM_ETH_LOCKED,
    sqrtPriceX96ToTokenPrices,
    USDC_WETH_03_POOL,
    WETH_ADDRESS,
    WHITELIST_TOKENS,
} from '../utils/pricing'
import {contractContext, type ContractContext} from '../utils/rpc'
import {ethPriceId, LiveEthPrice, RecordedEthPrice, type EthPriceSource} from '../utils/ethPrice'
import {createTick, feeTierToTickSpacing} from '../utils/tick'
import type {PoolEvent, TransactionInfo} from './extract'

type EventOf<K extends PoolEvent['kind']> = Extract<PoolEvent, {kind: K}>

export async function applyPoolEvents(
    ctx: Context,
    entities: Entities,
    events: PoolEvent[],
    phase: Phase
): Promise<void> {
    if (events.length === 0) return

    await load(entities, events)

    // The phase that indexes the pricing pool reads the price off the live pool
    // row and records it; every other pass replays what it recorded.
    const ethPrice: EthPriceSource =
        phase.kind === 'head' || phase.index === 0
            ? new LiveEthPrice(entities)
            : await RecordedEthPrice.load(ctx.store, events[0].blockNumber, events[events.length - 1].blockNumber)

    for (const event of events) {
        switch (event.kind) {
            case 'Initialize':
                applyInitialize(entities, ethPrice, event)
                break
            case 'Mint':
                applyMint(entities, ethPrice, event)
                break
            case 'Burn':
                applyBurn(entities, ethPrice, event)
                break
            case 'Swap':
                applySwap(entities, ethPrice, event)
                break
        }
    }

    await refreshFeeVars(entities, events[events.length - 1].blockNumber)
}

/**
 * Collects every id the batch can possibly touch and fetches it in bulk.
 *
 * The pool set is widened two hops: the pools the events name, their tokens,
 * the whitelist pools those tokens are priced against, and in turn those pools'
 * tokens. That is exactly how far `getEthPerToken` walks, so anything it asks
 * for afterwards is already in memory.
 */
async function load(entities: Entities, events: PoolEvent[]): Promise<void> {
    // The USDC/WETH pool is not necessarily traded in this batch, but the ETH
    // price is read out of it on every event.
    const poolIds = new Set<string>([USDC_WETH_03_POOL])
    const tickIds = new Set<string>()
    const dayIndices = new Set<number>()
    const hourIndices = new Set<number>()

    for (const event of events) {
        poolIds.add(event.poolId)
        switch (event.kind) {
            case 'Initialize':
            case 'Swap':
                tickIds.add(tickId(event.poolId, event.tick))
                break
            case 'Mint':
            case 'Burn':
                tickIds.add(tickId(event.poolId, event.tickLower))
                tickIds.add(tickId(event.poolId, event.tickUpper))
                break
        }
        dayIndices.add(getDayIndex(event.timestamp))
        hourIndices.add(getHourIndex(event.timestamp))
    }

    await entities.load(Bundle, ['1'])
    await entities.load(Factory, [FACTORY_ADDRESS])

    let pools = await entities.load(Pool, poolIds)
    for (const pool of pools.values()) tickIds.add(tickId(pool.id, pool.tick ?? 0))
    const ticks = await entities.load(Tick, tickIds)

    let tokens = await entities.load(Token, collectTokens(pools.values()))
    pools = await entities.load(Pool, collectWhitelistPools(tokens.values()))
    tokens = await entities.load(Token, collectTokens(pools.values()))

    const uniswapDayIds: string[] = []
    const poolDayIds: string[] = []
    const poolHourIds: string[] = []
    const tokenDayIds: string[] = []
    const tokenHourIds: string[] = []
    const tickDayIds: string[] = []

    for (const index of dayIndices) {
        uniswapDayIds.push(snapshotId(FACTORY_ADDRESS, index))
        for (const id of pools.keys()) poolDayIds.push(snapshotId(id, index))
        for (const id of tokens.keys()) tokenDayIds.push(snapshotId(id, index))
        for (const id of ticks.keys()) tickDayIds.push(snapshotId(id, index))
    }

    for (const index of hourIndices) {
        for (const id of pools.keys()) poolHourIds.push(snapshotId(id, index))
        for (const id of tokens.keys()) tokenHourIds.push(snapshotId(id, index))
    }

    await entities.load(UniswapDayData, uniswapDayIds)
    await entities.load(PoolDayData, poolDayIds)
    await entities.load(TokenDayData, tokenDayIds)
    await entities.load(TickDayData, tickDayIds)
    await entities.load(PoolHourData, poolHourIds)
    await entities.load(TokenHourData, tokenHourIds)
}

/**
 * Appends to the ETH/USD series when the pricing pool's own price moves.
 *
 * Only the phase that indexes that pool records; the others read. `priceUSD` is
 * the value already resolved into the bundle, i.e. the pool's new token0Price.
 */
function recordEthPrice(
    entities: Entities,
    ethPrice: EthPriceSource,
    event: {poolId: string; blockNumber: number; logIndex: number},
    priceUSD: number
): void {
    if (!ethPrice.records) return
    if (event.poolId !== USDC_WETH_03_POOL) return
    if (!(priceUSD > 0)) return

    entities.set(
        new EthPrice({
            id: ethPriceId(event.blockNumber, event.logIndex),
            blockNumber: event.blockNumber,
            logIndex: event.logIndex,
            priceUSD,
        })
    )
}

function applyInitialize(entities: Entities, ethPrice: EthPriceSource, event: EventOf<'Initialize'>): void {
    const bundle = entities.getOrFail(Bundle, '1')

    const pool = entities.get(Pool, event.poolId)
    if (pool == null) return

    const token0 = entities.getOrFail(Token, pool.token0Id)
    const token1 = entities.getOrFail(Token, pool.token1Id)

    bundle.ethPriceUSD = ethPrice.at(event.blockNumber, event.logIndex)

    // update pool sqrt price and tick
    pool.sqrtPrice = event.sqrtPrice
    pool.tick = event.tick

    // Calculate and update token prices from sqrtPrice
    const prices = sqrtPriceX96ToTokenPrices(
        event.sqrtPrice,
        token0.decimals,
        token1.decimals,
        event.poolId,
        token0.symbol,
        token1.symbol,
        new Date(event.timestamp).toISOString()
    )
    pool.token0Price = prices[0]
    pool.token1Price = prices[1]

    // update token prices
    token0.derivedETH = getEthPerToken(entities, token0.id)
    token1.derivedETH = getEthPerToken(entities, token1.id)

    bundle.ethPriceUSD = ethPrice.at(event.blockNumber, event.logIndex)
    recordEthPrice(entities, ethPrice, event, bundle.ethPriceUSD)

    entities.set(bundle)
    entities.set(pool)
    entities.set(token0)
    entities.set(token1)

    // Initialize is not counted in pool.txCount anywhere else, so it must not
    // count here either.
    updatePoolDayData(entities, event.timestamp, pool.id, false)
    updatePoolHourData(entities, event.timestamp, pool.id, false)
    updateTokenDayData(entities, event, token0.id)
    updateTokenHourData(entities, event, token0.id)
    updateTokenDayData(entities, event, token1.id)
    updateTokenHourData(entities, event, token1.id)
}

function applyMint(entities: Entities, ethPrice: EthPriceSource, event: EventOf<'Mint'>): void {
    const bundle = entities.getOrFail(Bundle, '1')
    const factory = entities.getOrFail(Factory, FACTORY_ADDRESS)

    const pool = entities.get(Pool, event.poolId)
    if (pool == null) return

    const token0 = entities.getOrFail(Token, pool.token0Id)
    const token1 = entities.getOrFail(Token, pool.token1Id)

    bundle.ethPriceUSD = ethPrice.at(event.blockNumber, event.logIndex)

    const amount0 = BigDecimal(event.amount0, token0.decimals).toNumber()
    const amount1 = BigDecimal(event.amount1, token1.decimals).toNumber()

    const amountUSD =
        amount0 * (token0.derivedETH * bundle.ethPriceUSD) + amount1 * (token1.derivedETH * bundle.ethPriceUSD)

    // Levels as they stand before this event, for the bucket TVL deltas
    // assembled at the end of the handler. Each accumulator is touched in more
    // than one place below, so the delta is read back off the accumulator
    // rather than assumed to equal the event amount.
    const poolTvlETHBefore = pool.totalValueLockedETH
    const token0TvlBefore = token0.totalValueLocked
    const token1TvlBefore = token1.totalValueLocked

    // reset tvl aggregates until new amounts calculated
    factory.totalValueLockedETH = factory.totalValueLockedETH - pool.totalValueLockedETH

    // update globals
    factory.txCount++

    // update token0 data
    token0.txCount++
    token0.totalValueLocked = token0.totalValueLocked + amount0
    token0.totalValueLockedUSD = token0.totalValueLocked * (token0.derivedETH * bundle.ethPriceUSD)

    // update token1 data
    token1.txCount++
    token1.totalValueLocked = token1.totalValueLocked + amount1
    token1.totalValueLockedUSD = token1.totalValueLocked * (token1.derivedETH * bundle.ethPriceUSD)

    // pool data
    pool.txCount++

    // Pools liquidity tracks the currently active liquidity given pools current tick.
    // We only want to update it on mint if the new position includes the current tick.
    if (pool.tick != null && event.tickLower <= pool.tick && event.tickUpper > pool.tick) {
        pool.liquidity += event.amount
    }

    pool.totalValueLockedToken0 = pool.totalValueLockedToken0 + amount0
    pool.totalValueLockedToken1 = pool.totalValueLockedToken1 + amount1
    pool.totalValueLockedETH =
        pool.totalValueLockedToken0 * token0.derivedETH + pool.totalValueLockedToken1 * token1.derivedETH
    pool.totalValueLockedUSD = pool.totalValueLockedETH * bundle.ethPriceUSD

    // reset aggregates with new amounts
    factory.totalValueLockedETH = factory.totalValueLockedETH + pool.totalValueLockedETH
    factory.totalValueLockedUSD = factory.totalValueLockedETH * bundle.ethPriceUSD

    // Re-price only: the amounts were already added above. Applying them a
    // second time here double-counted every mint into Token.totalValueLocked.
    token0.totalValueLockedUSD = token0.totalValueLocked * token0.derivedETH * bundle.ethPriceUSD
    token1.totalValueLockedUSD = token1.totalValueLocked * token1.derivedETH * bundle.ethPriceUSD

    const transaction = getOrCreateTransaction(entities, event)

    entities.set(
        new Mint({
            id: `${pool.id}#${pool.txCount}`,
            transactionId: transaction.id,
            timestamp: transaction.timestamp,
            poolId: pool.id,
            token0Id: pool.token0Id,
            token1Id: pool.token1Id,
            owner: event.owner,
            sender: event.sender,
            origin: event.transaction.from,
            amount: event.amount,
            amount0,
            amount1,
            amountUSD,
            tickLower: event.tickLower,
            tickUpper: event.tickUpper,
            logIndex: event.logIndex,
        })
    )

    // tick entities
    const lowerTickId = tickId(pool.id, event.tickLower)
    let lowerTick = entities.get(Tick, lowerTickId)
    if (lowerTick == null) {
        lowerTick = createTick(lowerTickId, event.tickLower, pool.id)
        lowerTick.createdAtBlockNumber = event.blockNumber
        lowerTick.createdAtTimestamp = new Date(event.timestamp)
    }

    const upperTickId = tickId(pool.id, event.tickUpper)
    let upperTick = entities.get(Tick, upperTickId)
    if (upperTick == null) {
        upperTick = createTick(upperTickId, event.tickUpper, pool.id)
        upperTick.createdAtBlockNumber = event.blockNumber
        upperTick.createdAtTimestamp = new Date(event.timestamp)
    }

    lowerTick.liquidityGross += event.amount
    lowerTick.liquidityNet += event.amount

    upperTick.liquidityGross += event.amount
    upperTick.liquidityNet -= event.amount

    entities.set(bundle)
    entities.set(factory)
    entities.set(pool)
    entities.set(token0)
    entities.set(token1)
    entities.set(lowerTick)
    entities.set(upperTick)

    // Update volume metrics
    const uniswapDayData = updateUniswapDayData(entities, event.timestamp)
    const poolDayData = updatePoolDayData(entities, event.timestamp, pool.id)
    const poolHourData = updatePoolHourData(entities, event.timestamp, pool.id)
    const token0DayData = updateTokenDayData(entities, event, token0.id)
    const token0HourData = updateTokenHourData(entities, event, token0.id)
    const token1DayData = updateTokenDayData(entities, event, token1.id)
    const token1HourData = updateTokenHourData(entities, event, token1.id)

    accumulateTvlDeltas(
        {uniswapDayData, token0DayData, token0HourData, token1DayData, token1HourData},
        pool.totalValueLockedETH - poolTvlETHBefore,
        token0.totalValueLocked - token0TvlBefore,
        token1.totalValueLocked - token1TvlBefore
    )

    if (poolDayData && poolHourData) {
        poolDayData.volumeUSD = poolDayData.volumeUSD + amountUSD
        poolDayData.volumeToken0 = poolDayData.volumeToken0 + amount0
        poolDayData.volumeToken1 = poolDayData.volumeToken1 + amount1

        poolHourData.volumeUSD = poolHourData.volumeUSD + amountUSD
        poolHourData.volumeToken0 = poolHourData.volumeToken0 + amount0
        poolHourData.volumeToken1 = poolHourData.volumeToken1 + amount1
    }

    token0DayData.volume = token0DayData.volume + amount0
    token0DayData.volumeUSD = token0DayData.volumeUSD + amountUSD

    token0HourData.volume = token0HourData.volume + amount0
    token0HourData.volumeUSD = token0HourData.volumeUSD + amountUSD

    token1DayData.volume = token1DayData.volume + amount1
    token1DayData.volumeUSD = token1DayData.volumeUSD + amountUSD

    token1HourData.volume = token1HourData.volume + amount1
    token1HourData.volumeUSD = token1HourData.volumeUSD + amountUSD
}

function applyBurn(entities: Entities, ethPrice: EthPriceSource, event: EventOf<'Burn'>): void {
    const bundle = entities.getOrFail(Bundle, '1')
    const factory = entities.getOrFail(Factory, FACTORY_ADDRESS)

    const pool = entities.get(Pool, event.poolId)
    if (pool == null) return

    const token0 = entities.getOrFail(Token, pool.token0Id)
    const token1 = entities.getOrFail(Token, pool.token1Id)

    bundle.ethPriceUSD = ethPrice.at(event.blockNumber, event.logIndex)

    const amount0 = BigDecimal(event.amount0, token0.decimals).toNumber()
    const amount1 = BigDecimal(event.amount1, token1.decimals).toNumber()

    const amountUSD =
        amount0 * (token0.derivedETH * bundle.ethPriceUSD) + amount1 * (token1.derivedETH * bundle.ethPriceUSD)

    // Levels as they stand before this event - see applyMint.
    const poolTvlETHBefore = pool.totalValueLockedETH
    const token0TvlBefore = token0.totalValueLocked
    const token1TvlBefore = token1.totalValueLocked

    // reset tvl aggregates until new amounts calculated
    factory.totalValueLockedETH = factory.totalValueLockedETH - pool.totalValueLockedETH

    // update globals
    factory.txCount++

    // update token0 data
    token0.txCount++
    token0.totalValueLocked = token0.totalValueLocked - amount0
    token0.totalValueLockedUSD = token0.totalValueLocked * (token0.derivedETH * bundle.ethPriceUSD)

    // update token1 data
    token1.txCount++
    token1.totalValueLocked = token1.totalValueLocked - amount1
    token1.totalValueLockedUSD = token1.totalValueLocked * (token1.derivedETH * bundle.ethPriceUSD)

    // pool data
    pool.txCount++
    // Pools liquidity tracks the currently active liquidity given pools current tick.
    // We only want to update it on burn if the position being burnt includes the current tick.
    if (pool.tick != null && event.tickLower <= pool.tick && event.tickUpper > pool.tick) {
        pool.liquidity -= event.amount
    }

    pool.totalValueLockedToken0 = pool.totalValueLockedToken0 - amount0
    pool.totalValueLockedToken1 = pool.totalValueLockedToken1 - amount1

    // Update TVL in ETH and USD
    pool.totalValueLockedETH =
        pool.totalValueLockedToken0 * token0.derivedETH + pool.totalValueLockedToken1 * token1.derivedETH
    pool.totalValueLockedUSD = pool.totalValueLockedETH * bundle.ethPriceUSD

    // Update factory TVL
    factory.totalValueLockedETH = factory.totalValueLockedETH + pool.totalValueLockedETH
    factory.totalValueLockedUSD = factory.totalValueLockedETH * bundle.ethPriceUSD

    // Update token TVL
    // Re-price only: the amounts were already subtracted above. Applying them a
    // second time here double-counted every burn out of Token.totalValueLocked.
    token0.totalValueLockedUSD = token0.totalValueLocked * token0.derivedETH * bundle.ethPriceUSD
    token1.totalValueLockedUSD = token1.totalValueLocked * token1.derivedETH * bundle.ethPriceUSD

    // burn entity
    const transaction = getOrCreateTransaction(entities, event)

    entities.set(
        new Burn({
            id: `${pool.id}#${pool.txCount}`,
            transactionId: transaction.id,
            timestamp: new Date(event.timestamp),
            poolId: pool.id,
            token0Id: pool.token0Id,
            token1Id: pool.token1Id,
            owner: event.owner,
            origin: event.transaction.from,
            amount: event.amount,
            amount0,
            amount1,
            amountUSD,
            tickLower: event.tickLower,
            tickUpper: event.tickUpper,
            logIndex: event.logIndex,
        })
    )

    // tick entities
    const lowerTick = entities.get(Tick, tickId(pool.id, event.tickLower))
    const upperTick = entities.get(Tick, tickId(pool.id, event.tickUpper))

    if (lowerTick) {
        lowerTick.liquidityGross -= event.amount
        lowerTick.liquidityNet -= event.amount
        entities.set(lowerTick)
    }

    if (upperTick) {
        upperTick.liquidityGross -= event.amount
        upperTick.liquidityNet += event.amount
        entities.set(upperTick)
    }

    entities.set(bundle)
    entities.set(factory)
    entities.set(pool)
    entities.set(token0)
    entities.set(token1)

    // Update volume metrics
    const uniswapDayData = updateUniswapDayData(entities, event.timestamp)
    const poolDayData = updatePoolDayData(entities, event.timestamp, pool.id)
    const poolHourData = updatePoolHourData(entities, event.timestamp, pool.id)
    const token0DayData = updateTokenDayData(entities, event, token0.id)
    const token0HourData = updateTokenHourData(entities, event, token0.id)
    const token1DayData = updateTokenDayData(entities, event, token1.id)
    const token1HourData = updateTokenHourData(entities, event, token1.id)

    accumulateTvlDeltas(
        {uniswapDayData, token0DayData, token0HourData, token1DayData, token1HourData},
        pool.totalValueLockedETH - poolTvlETHBefore,
        token0.totalValueLocked - token0TvlBefore,
        token1.totalValueLocked - token1TvlBefore
    )

    if (poolDayData && poolHourData) {
        poolDayData.volumeUSD = poolDayData.volumeUSD + amountUSD
        poolDayData.volumeToken0 = poolDayData.volumeToken0 + amount0
        poolDayData.volumeToken1 = poolDayData.volumeToken1 + amount1

        poolHourData.volumeUSD = poolHourData.volumeUSD + amountUSD
        poolHourData.volumeToken0 = poolHourData.volumeToken0 + amount0
        poolHourData.volumeToken1 = poolHourData.volumeToken1 + amount1
    }

    token0DayData.volume = token0DayData.volume + amount0
    token0DayData.volumeUSD = token0DayData.volumeUSD + amountUSD

    token0HourData.volume = token0HourData.volume + amount0
    token0HourData.volumeUSD = token0HourData.volumeUSD + amountUSD

    token1DayData.volume = token1DayData.volume + amount1
    token1DayData.volumeUSD = token1DayData.volumeUSD + amountUSD

    token1HourData.volume = token1HourData.volume + amount1
    token1HourData.volumeUSD = token1HourData.volumeUSD + amountUSD
}

function applySwap(entities: Entities, ethPrice: EthPriceSource, event: EventOf<'Swap'>): void {
    if (event.poolId == '0x9663f2ca0454accad3e094448ea6f77443880454') return

    const bundle = entities.getOrFail(Bundle, '1')
    const factory = entities.getOrFail(Factory, FACTORY_ADDRESS)

    const pool = entities.get(Pool, event.poolId)
    if (pool == null) return

    const token0 = entities.getOrFail(Token, pool.token0Id)
    const token1 = entities.getOrFail(Token, pool.token1Id)

    bundle.ethPriceUSD = ethPrice.at(event.blockNumber, event.logIndex)

    const amount0 = BigDecimal(event.amount0, token0.decimals).toNumber()
    const amount1 = BigDecimal(event.amount1, token1.decimals).toNumber()

    // need absolute amounts for volume
    const amount0Abs = Math.abs(amount0)
    const amount1Abs = Math.abs(amount1)

    const amount0ETH = amount0Abs * token0.derivedETH
    const amount1ETH = amount1Abs * token1.derivedETH
    const amount0USD = amount0ETH * bundle.ethPriceUSD
    const amount1USD = amount1ETH * bundle.ethPriceUSD

    // get amount that should be tracked only - div 2 because cant count both input and output as volume
    const amountTotalUSDTracked = getTrackedAmountUSD(token0.id, amount0USD, token1.id, amount1USD)

    const amountTotalETHTracked = safeDiv(amountTotalUSDTracked, bundle.ethPriceUSD)
    const amountTotalUSDUntracked = (amount0USD + amount1USD) / 2

    const feesETH = (Number(amountTotalETHTracked) * Number(pool.feeTier)) / 1000000
    const feesUSD = (Number(amountTotalUSDTracked) * Number(pool.feeTier)) / 1000000

    // global updates
    factory.txCount++
    factory.totalVolumeETH = factory.totalVolumeETH + amountTotalETHTracked
    factory.totalVolumeUSD = factory.totalVolumeUSD + amountTotalUSDTracked
    factory.untrackedVolumeUSD = factory.untrackedVolumeUSD + amountTotalUSDUntracked
    factory.totalFeesETH = factory.totalFeesETH + feesETH
    factory.totalFeesUSD = factory.totalFeesUSD + feesUSD

    // reset aggregate tvl before individual pool tvl updates
    const currentPoolTvlETH = pool.totalValueLockedETH
    factory.totalValueLockedETH = factory.totalValueLockedETH - currentPoolTvlETH

    // Token levels as they stand before this event - see applyMint. The pool's
    // is `currentPoolTvlETH` just above.
    const token0TvlBefore = token0.totalValueLocked
    const token1TvlBefore = token1.totalValueLocked

    // pool volume
    pool.txCount++
    pool.volumeToken0 = pool.volumeToken0 + amount0Abs
    pool.volumeToken1 = pool.volumeToken1 + amount1Abs
    pool.volumeUSD = pool.volumeUSD + amountTotalUSDTracked
    pool.untrackedVolumeUSD = pool.untrackedVolumeUSD + amountTotalUSDUntracked
    pool.feesUSD = pool.feesUSD + feesUSD

    // Update the pool with the new active liquidity, price, and tick.
    pool.liquidity = event.liquidity
    pool.tick = event.tick
    pool.sqrtPrice = event.sqrtPrice
    pool.totalValueLockedToken0 = pool.totalValueLockedToken0 + amount0
    pool.totalValueLockedToken1 = pool.totalValueLockedToken1 + amount1

    // update token0 data
    token0.txCount++
    token0.volume = token0.volume + amount0Abs
    token0.totalValueLocked = token0.totalValueLocked + amount0
    token0.volumeUSD = token0.volumeUSD + amountTotalUSDTracked
    token0.untrackedVolumeUSD = token0.untrackedVolumeUSD + amountTotalUSDUntracked
    token0.feesUSD = token0.feesUSD + feesUSD

    // update token1 data
    token1.txCount++
    token1.volume = token1.volume + amount1Abs
    token1.totalValueLocked = token1.totalValueLocked + amount1
    token1.volumeUSD = token1.volumeUSD + amountTotalUSDTracked
    token1.untrackedVolumeUSD = token1.untrackedVolumeUSD + amountTotalUSDUntracked
    token1.feesUSD = token1.feesUSD + feesUSD

    // updated pool rates
    const prices = sqrtPriceX96ToTokenPrices(
        pool.sqrtPrice,
        token0.decimals,
        token1.decimals,
        pool.id,
        token0.symbol,
        token1.symbol,
        new Date(event.timestamp).toISOString()
    )
    pool.token0Price = prices[0]
    pool.token1Price = prices[1]

    // update USD pricing
    token0.derivedETH = getEthPerToken(entities, token0.id)
    token1.derivedETH = getEthPerToken(entities, token1.id)

    bundle.ethPriceUSD = ethPrice.at(event.blockNumber, event.logIndex)
    recordEthPrice(entities, ethPrice, event, bundle.ethPriceUSD)

    // Things affected by new USD rates
    pool.totalValueLockedETH =
        pool.totalValueLockedToken0 * token0.derivedETH + pool.totalValueLockedToken1 * token1.derivedETH
    pool.totalValueLockedUSD = pool.totalValueLockedETH * bundle.ethPriceUSD

    // Update factory TVL
    factory.totalValueLockedETH = factory.totalValueLockedETH + pool.totalValueLockedETH
    factory.totalValueLockedUSD = factory.totalValueLockedETH * bundle.ethPriceUSD

    token0.totalValueLockedUSD = token0.totalValueLocked * token0.derivedETH * bundle.ethPriceUSD
    token1.totalValueLockedUSD = token1.totalValueLocked * token1.derivedETH * bundle.ethPriceUSD

    entities.set(bundle)
    entities.set(factory)
    entities.set(pool)
    entities.set(token0)
    entities.set(token1)

    // interval data
    const uniswapDayData = updateUniswapDayData(entities, event.timestamp)
    const poolDayData = updatePoolDayData(entities, event.timestamp, pool.id)
    const poolHourData = updatePoolHourData(entities, event.timestamp, pool.id)
    const token0DayData = updateTokenDayData(entities, event, token0.id)
    const token0HourData = updateTokenHourData(entities, event, token0.id)
    const token1DayData = updateTokenDayData(entities, event, token1.id)
    const token1HourData = updateTokenHourData(entities, event, token1.id)

    accumulateTvlDeltas(
        {uniswapDayData, token0DayData, token0HourData, token1DayData, token1HourData},
        pool.totalValueLockedETH - currentPoolTvlETH,
        token0.totalValueLocked - token0TvlBefore,
        token1.totalValueLocked - token1TvlBefore
    )

    uniswapDayData.volumeETH = uniswapDayData.volumeETH + amountTotalETHTracked
    uniswapDayData.volumeUSD = uniswapDayData.volumeUSD + amountTotalUSDTracked
    uniswapDayData.feesUSD = uniswapDayData.feesUSD + feesUSD

    // Update volume metrics
    if (poolDayData && poolHourData) {
        poolDayData.volumeUSD = poolDayData.volumeUSD + amountTotalUSDTracked
        poolDayData.volumeToken0 = poolDayData.volumeToken0 + amount0Abs
        poolDayData.volumeToken1 = poolDayData.volumeToken1 + amount1Abs
        poolDayData.feesUSD = poolDayData.feesUSD + feesUSD

        poolHourData.volumeUSD = poolHourData.volumeUSD + amountTotalUSDTracked
        poolHourData.volumeToken0 = poolHourData.volumeToken0 + amount0Abs
        poolHourData.volumeToken1 = poolHourData.volumeToken1 + amount1Abs
        poolHourData.feesUSD = poolHourData.feesUSD + feesUSD
    }

    token0DayData.volume = token0DayData.volume + amount0Abs
    token0DayData.volumeUSD = token0DayData.volumeUSD + amountTotalUSDTracked
    token0DayData.untrackedVolumeUSD = token0DayData.untrackedVolumeUSD + amountTotalUSDUntracked
    token0DayData.feesUSD = token0DayData.feesUSD + feesUSD

    token0HourData.volume = token0HourData.volume + amount0Abs
    token0HourData.volumeUSD = token0HourData.volumeUSD + amountTotalUSDTracked
    token0HourData.untrackedVolumeUSD = token0HourData.untrackedVolumeUSD + amountTotalUSDUntracked
    token0HourData.feesUSD = token0HourData.feesUSD + feesUSD

    token1DayData.volume = token1DayData.volume + amount1Abs
    token1DayData.volumeUSD = token1DayData.volumeUSD + amountTotalUSDTracked
    token1DayData.untrackedVolumeUSD = token1DayData.untrackedVolumeUSD + amountTotalUSDUntracked
    token1DayData.feesUSD = token1DayData.feesUSD + feesUSD

    token1HourData.volume = token1HourData.volume + amount1Abs
    token1HourData.volumeUSD = token1HourData.volumeUSD + amountTotalUSDTracked
    token1HourData.untrackedVolumeUSD = token1HourData.untrackedVolumeUSD + amountTotalUSDUntracked
    token1HourData.feesUSD = token1HourData.feesUSD + feesUSD

    // Update inner vars of current or crossed ticks
    const newTick = event.tick
    const tickSpacing = feeTierToTickSpacing(pool.feeTier)
    const modulo = Math.floor(Number(newTick) / Number(tickSpacing))
    if (modulo == 0) {
        const tick = createTick(tickId(pool.id, newTick), newTick, pool.id)
        tick.createdAtBlockNumber = event.blockNumber
        tick.createdAtTimestamp = new Date(event.timestamp)
        entities.set(tick)
    }

    // create Swap event
    const transaction = getOrCreateTransaction(entities, event)

    const swap = new Swap({id: pool.id + '#' + pool.txCount.toString()})
    swap.transactionId = transaction.id
    swap.timestamp = transaction.timestamp
    swap.poolId = pool.id
    swap.token0Id = pool.token0Id
    swap.token1Id = pool.token1Id
    swap.sender = event.sender
    swap.origin = event.transaction.from
    swap.recipient = event.recipient
    swap.amount0 = amount0
    swap.amount1 = amount1
    swap.amountUSD = amountTotalUSDTracked
    swap.tick = event.tick
    swap.sqrtPriceX96 = event.sqrtPrice
    swap.logIndex = event.logIndex
    entities.set(swap)
}

/**
 * ETH per unit of a token, for use while pricing some *other* token.
 *
 * `Token.derivedETH` is a stored column, so reading it directly is the same
 * trap as reading `Bundle.ethPriceUSD` directly: for a whitelisted token the
 * row holds whatever the last pass to touch it wrote, which is a price from the
 * cutoff rather than from this block. A whitelisted token's value is a pure
 * function of the ETH price, so it is recomputed here instead of read. Tokens
 * that are not whitelisted are priced against pools in their own pass, so their
 * stored value is already contemporaneous.
 */
function derivedEthFor(entities: Entities, token: Token): number {
    if (token.id.toLowerCase() === WETH_ADDRESS.toLowerCase()) return 1
    if (WHITELIST_TOKENS.includes(token.id.toLowerCase())) {
        return safeDiv(1, entities.getOrFail(Bundle, '1').ethPriceUSD)
    }
    return token.derivedETH
}

function getEthPerToken(entities: Entities, tokenId: string): number {
    const bundle = entities.getOrFail(Bundle, '1')
    const token = entities.getOrFail(Token, tokenId)

    // Return 1 for WETH
    if (tokenId.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
        return 1
    }

    // for now just take USD from pool with greatest TVL
    // need to update this to actually detect best rate based on liquidity distribution
    let largestLiquidityETH = MINIMUM_ETH_LOCKED
    let priceSoFar = 0

    // Use WHITELIST_TOKENS instead of STABLE_COINS for consistency
    if (WHITELIST_TOKENS.includes(tokenId.toLowerCase())) {
        priceSoFar = safeDiv(1, bundle.ethPriceUSD)
    } else {
        for (const poolAddress of token.whitelistPools) {
            const pool = entities.getOrFail(Pool, poolAddress)
            if (pool.liquidity === 0n) continue

            if (pool.token0Id.toLowerCase() === tokenId.toLowerCase()) {
                // whitelist token is token1
                const token1 = entities.getOrFail(Token, pool.token1Id)
                const derived1 = derivedEthFor(entities, token1)
                // Skip if token1's price is not derived yet
                if (derived1 === 0) continue

                // get the derived ETH in pool
                const ethLocked = pool.totalValueLockedToken1 * derived1
                if (ethLocked > largestLiquidityETH && ethLocked >= MINIMUM_ETH_LOCKED) {
                    largestLiquidityETH = ethLocked
                    // token1 per our token * Eth per token1
                    priceSoFar = pool.token1Price * derived1
                }
            }
            if (pool.token1Id.toLowerCase() === tokenId.toLowerCase()) {
                // whitelist token is token0
                const token0 = entities.getOrFail(Token, pool.token0Id)
                const derived0 = derivedEthFor(entities, token0)
                // Skip if token0's price is not derived yet
                if (derived0 === 0) continue

                // get the derived ETH in pool
                const ethLocked = pool.totalValueLockedToken0 * derived0
                if (ethLocked > largestLiquidityETH && ethLocked >= MINIMUM_ETH_LOCKED) {
                    largestLiquidityETH = ethLocked
                    // token0 per our token * ETH per token0
                    priceSoFar = pool.token0Price * derived0
                }
            }
        }
    }
    return priceSoFar
}

/**
 * Adds one event's TVL flows to the buckets that cover it.
 *
 * TVL is a stock, so a bucket cannot count it the way it counts `txCount`: the
 * levels the buckets sample - `UniswapDayData.tvlUSD` and the token buckets'
 * `totalValueLocked*` - are read off accumulators that the passes still to run
 * have not contributed to yet, so they are incomplete at write time. What *is*
 * order-independent is the change one event makes, which is a flow, so each
 * bucket sums its own. `sqd finalize` prefix-sums those back into levels once
 * every pass has finished; see src/tools/finalize.ts. Only ever accumulates -
 * a pass must never overwrite what another pass added.
 */
function accumulateTvlDeltas(
    buckets: {
        uniswapDayData: UniswapDayData
        token0DayData: TokenDayData
        token0HourData: TokenHourData
        token1DayData: TokenDayData
        token1HourData: TokenHourData
    },
    factoryETHDelta: number,
    token0Delta: number,
    token1Delta: number
): void {
    buckets.uniswapDayData.tvlETHDelta = buckets.uniswapDayData.tvlETHDelta + factoryETHDelta
    buckets.token0DayData.tvlDelta = buckets.token0DayData.tvlDelta + token0Delta
    buckets.token0HourData.tvlDelta = buckets.token0HourData.tvlDelta + token0Delta
    buckets.token1DayData.tvlDelta = buckets.token1DayData.tvlDelta + token1Delta
    buckets.token1HourData.tvlDelta = buckets.token1HourData.tvlDelta + token1Delta
}

function updateUniswapDayData(entities: Entities, timestamp: number): UniswapDayData {
    const uniswap = entities.getOrFail(Factory, FACTORY_ADDRESS)

    const dayID = getDayIndex(timestamp)
    const id = snapshotId(FACTORY_ADDRESS, dayID)

    let uniswapDayData = entities.get(UniswapDayData, id)
    if (uniswapDayData == null) {
        uniswapDayData = createUniswapDayData(FACTORY_ADDRESS, dayID)
    }
    uniswapDayData.tvlUSD = uniswap.totalValueLockedUSD
    // Counted per bucket, not sampled from the global counter. The schema calls
    // this "number of transactions during period", and a running total sampled
    // mid-flight is both a different quantity and pass-order dependent: a bucket
    // is written by every pass with an event in it, so the sample would carry
    // the earlier passes' whole-range totals. Counting is order-independent.
    uniswapDayData.txCount = uniswapDayData.txCount + 1

    return entities.set(uniswapDayData)
}

function updatePoolDayData(entities: Entities, timestamp: number, poolId: string, countsAsTx = true): PoolDayData | null {
    const pool = entities.getOrFail(Pool, poolId)

    // Skip creating records if there's no valid price data
    if (pool.sqrtPrice === 0n) {
        return null
    }

    const token0 = entities.getOrFail(Token, pool.token0Id)
    const token1 = entities.getOrFail(Token, pool.token1Id)
    const prices = sqrtPriceX96ToTokenPrices(
        pool.sqrtPrice,
        token0.decimals,
        token1.decimals,
        pool.id,
        token0.symbol,
        token1.symbol,
        new Date(timestamp).toISOString()
    )

    // Skip if we don't have valid prices
    if (prices[0] === 0 || prices[1] === 0) {
        return null
    }

    const dayID = getDayIndex(timestamp)
    const dayPoolID = snapshotId(poolId, dayID)

    let poolDayData = entities.get(PoolDayData, dayPoolID)
    const isNewEntity = !poolDayData

    if (!poolDayData) {
        poolDayData = createPoolDayData(poolId, dayID)
    }

    // Update prices
    if (isNewEntity || poolDayData.open === 0) {
        poolDayData.open = prices[0]
    }
    if (isNewEntity || poolDayData.high === 0 || prices[0] > poolDayData.high) {
        poolDayData.high = prices[0]
    }
    if (isNewEntity || poolDayData.low === 0 || prices[0] < poolDayData.low) {
        poolDayData.low = prices[0]
    }
    poolDayData.close = prices[0]
    poolDayData.token0Price = prices[0]
    poolDayData.token1Price = prices[1]

    // Update TVL
    poolDayData.tvlUSD = pool.totalValueLockedUSD
    poolDayData.liquidity = pool.liquidity
    poolDayData.sqrtPrice = pool.sqrtPrice
    poolDayData.feeGrowthGlobal0X128 = pool.feeGrowthGlobal0X128
    poolDayData.feeGrowthGlobal1X128 = pool.feeGrowthGlobal1X128
    poolDayData.tick = pool.tick
    // Counted per bucket, not sampled from the global counter. The schema calls
    // this "number of transactions during period", and a running total sampled
    // mid-flight is both a different quantity and pass-order dependent: a bucket
    // is written by every pass with an event in it, so the sample would carry
    // the earlier passes' whole-range totals. Counting is order-independent.
    if (countsAsTx) poolDayData.txCount = poolDayData.txCount + 1

    return entities.set(poolDayData)
}

function updatePoolHourData(entities: Entities, timestamp: number, poolId: string, countsAsTx = true): PoolHourData | null {
    const pool = entities.getOrFail(Pool, poolId)

    // Skip creating records if there's no valid price data
    if (pool.sqrtPrice === 0n) {
        return null
    }

    const token0 = entities.getOrFail(Token, pool.token0Id)
    const token1 = entities.getOrFail(Token, pool.token1Id)
    const prices = sqrtPriceX96ToTokenPrices(
        pool.sqrtPrice,
        token0.decimals,
        token1.decimals,
        pool.id,
        token0.symbol,
        token1.symbol,
        new Date(timestamp).toISOString()
    )

    // Skip if we don't have valid prices
    if (prices[0] === 0 || prices[1] === 0) {
        return null
    }

    const hourIndex = getHourIndex(timestamp)
    const hourPoolID = snapshotId(poolId, hourIndex)

    let poolHourData = entities.get(PoolHourData, hourPoolID)
    const isNewEntity = !poolHourData

    if (!poolHourData) {
        poolHourData = createPoolHourData(poolId, hourIndex)
    }

    // Update prices
    if (isNewEntity || poolHourData.open === 0) {
        poolHourData.open = prices[0]
    }
    if (isNewEntity || poolHourData.high === 0 || prices[0] > poolHourData.high) {
        poolHourData.high = prices[0]
    }
    if (isNewEntity || poolHourData.low === 0 || prices[0] < poolHourData.low) {
        poolHourData.low = prices[0]
    }
    poolHourData.close = prices[0]
    poolHourData.token0Price = prices[0]
    poolHourData.token1Price = prices[1]

    // Update TVL
    poolHourData.tvlUSD = pool.totalValueLockedUSD
    poolHourData.liquidity = pool.liquidity
    poolHourData.sqrtPrice = pool.sqrtPrice
    poolHourData.feeGrowthGlobal0X128 = pool.feeGrowthGlobal0X128
    poolHourData.feeGrowthGlobal1X128 = pool.feeGrowthGlobal1X128
    poolHourData.tick = pool.tick
    // Counted per bucket, not sampled from the global counter. The schema calls
    // this "number of transactions during period", and a running total sampled
    // mid-flight is both a different quantity and pass-order dependent: a bucket
    // is written by every pass with an event in it, so the sample would carry
    // the earlier passes' whole-range totals. Counting is order-independent.
    if (countsAsTx) poolHourData.txCount = poolHourData.txCount + 1

    return entities.set(poolHourData)
}

const LOG_INDEX_SPAN = 1_000_000n

/**
 * Total order over the chain's logs.
 *
 * `logIndex` on EVM is block-scoped - it counts every log in the block, across
 * all of its transactions - so (block, logIndex) sequences the chain on its own
 * and no transaction index is needed. The span is far above the number of logs
 * a block's gas limit allows.
 */
function eventOrder(blockNumber: number, logIndex: number): bigint {
    return BigInt(blockNumber) * LOG_INDEX_SPAN + BigInt(logIndex)
}

function updateTokenDayData(entities: Entities, event: PoolEvent, tokenId: string): TokenDayData {
    const bundle = entities.getOrFail(Bundle, '1')
    const token = entities.getOrFail(Token, tokenId)

    const dayID = getDayIndex(event.timestamp)
    const tokenDayID = snapshotId(tokenId, dayID)

    let tokenDayData = entities.get(TokenDayData, tokenDayID)
    const isNewEntity = !tokenDayData

    if (tokenDayData == null) {
        tokenDayData = createTokenDayData(tokenId, dayID)
    }

    // Calculate price only if we have valid inputs
    if (token.derivedETH > 0 && bundle.ethPriceUSD > 0) {
        const tokenPrice = token.derivedETH * bundle.ethPriceUSD

        if (tokenPrice > 0) {
            if (isNewEntity || tokenDayData.high === 0 || tokenPrice > tokenDayData.high) {
                tokenDayData.high = tokenPrice
            }

            if (isNewEntity || tokenDayData.low === 0 || tokenPrice < tokenDayData.low) {
                tokenDayData.low = tokenPrice
            }

            // A token's buckets are written by every pass that holds one of its
            // pools, in whatever order the passes run, so the earliest and
            // latest events have to win on position rather than on write order.
            const order = eventOrder(event.blockNumber, event.logIndex)

            if (tokenDayData.openOrder == null || order < tokenDayData.openOrder) {
                tokenDayData.open = tokenPrice
                tokenDayData.openOrder = order
            }

            if (tokenDayData.closeOrder == null || order > tokenDayData.closeOrder) {
                tokenDayData.close = tokenPrice
                tokenDayData.priceUSD = tokenPrice
                tokenDayData.closeOrder = order
            }
        }
    }

    // Only update TVL if values are non-zero
    if (token.totalValueLocked > 0) {
        tokenDayData.totalValueLocked = token.totalValueLocked
    }
    if (token.totalValueLockedUSD > 0) {
        tokenDayData.totalValueLockedUSD = token.totalValueLockedUSD
    }

    return entities.set(tokenDayData)
}

function updateTokenHourData(entities: Entities, event: PoolEvent, tokenId: string): TokenHourData {
    const bundle = entities.getOrFail(Bundle, '1')
    const token = entities.getOrFail(Token, tokenId)

    const hourID = getHourIndex(event.timestamp)
    const tokenHourID = snapshotId(tokenId, hourID)

    let tokenHourData = entities.get(TokenHourData, tokenHourID)
    const isNewEntity = !tokenHourData

    if (tokenHourData == null) {
        tokenHourData = createTokenHourData(tokenId, hourID)
    }

    // Calculate price only if we have valid inputs
    if (token.derivedETH > 0 && bundle.ethPriceUSD > 0) {
        const tokenPrice = token.derivedETH * bundle.ethPriceUSD

        if (tokenPrice > 0) {
            if (isNewEntity || tokenHourData.high === 0 || tokenPrice > tokenHourData.high) {
                tokenHourData.high = tokenPrice
            }

            if (isNewEntity || tokenHourData.low === 0 || tokenPrice < tokenHourData.low) {
                tokenHourData.low = tokenPrice
            }

            // A token's buckets are written by every pass that holds one of its
            // pools, in whatever order the passes run, so the earliest and
            // latest events have to win on position rather than on write order.
            const order = eventOrder(event.blockNumber, event.logIndex)

            if (tokenHourData.openOrder == null || order < tokenHourData.openOrder) {
                tokenHourData.open = tokenPrice
                tokenHourData.openOrder = order
            }

            if (tokenHourData.closeOrder == null || order > tokenHourData.closeOrder) {
                tokenHourData.close = tokenPrice
                tokenHourData.priceUSD = tokenPrice
                tokenHourData.closeOrder = order
            }
        }
    }

    // Only update TVL if values are non-zero
    if (token.totalValueLocked > 0) {
        tokenHourData.totalValueLocked = token.totalValueLocked
    }
    if (token.totalValueLockedUSD > 0) {
        tokenHourData.totalValueLockedUSD = token.totalValueLockedUSD
    }

    return entities.set(tokenHourData)
}

function updateTickDayData(entities: Entities, timestamp: number, id: string): TickDayData {
    const tick = entities.getOrFail(Tick, id)

    const dayID = getDayIndex(timestamp)
    const tickDayDataID = snapshotId(id, dayID)

    let tickDayData = entities.get(TickDayData, tickDayDataID)
    if (tickDayData == null) {
        tickDayData = createTickDayData(id, dayID)
    }
    tickDayData.liquidityGross = tick.liquidityGross
    tickDayData.liquidityNet = tick.liquidityNet
    tickDayData.volumeToken0 = tick.volumeToken0
    tickDayData.volumeToken1 = tick.volumeToken1
    tickDayData.volumeUSD = tick.volumeUSD
    tickDayData.feesUSD = tick.feesUSD
    tickDayData.feeGrowthOutside0X128 = tick.feeGrowthOutside0X128
    tickDayData.feeGrowthOutside1X128 = tick.feeGrowthOutside1X128

    return entities.set(tickDayData)
}

function getOrCreateTransaction(entities: Entities, event: PoolEvent): Tx {
    const existing = entities.get(Tx, event.transaction.hash)
    if (existing != null) return existing

    return entities.set(createTransaction(event.blockNumber, event.timestamp, event.transaction))
}

function createTransaction(blockNumber: number, timestamp: number, transaction: TransactionInfo): Tx {
    return new Tx({
        id: transaction.hash,
        blockNumber,
        timestamp: new Date(timestamp),
        gasUsed: transaction.gasUsed,
        gasPrice: transaction.gasPrice,
    })
}

function collectTokens(pools: Iterable<Pool>): Set<string> {
    const ids = new Set<string>()
    for (const pool of pools) {
        ids.add(pool.token0Id)
        ids.add(pool.token1Id)
    }
    return ids
}

function collectWhitelistPools(tokens: Iterable<Token>): Set<string> {
    const ids = new Set<string>()
    for (const token of tokens) {
        for (const id of token.whitelistPools) ids.add(id)
    }
    return ids
}

/**
 * Fee growth is contract state rather than log data, so it is read once per
 * batch at the last block the batch covers - the same height every pool and
 * tick is refreshed at, which keeps a batch's reads reproducible.
 */
async function refreshFeeVars(entities: Entities, height: number): Promise<void> {
    // Pass 0 writes a Pool row for every pool in the manifest, including ones
    // whose events belong to a later pass, and the whitelist hop pulls them
    // into the working set for pricing. A pool deployed after `height` is then
    // a row that exists in the database but not yet on the chain: calling into
    // it returns empty data, which fails to decode and kills the batch. Only
    // pools the chain already has can be read.
    const pools = entities.values(Pool).filter((pool) => pool.createdAtBlockNumber <= height)
    const deployed = new Set(pools.map((pool) => pool.id))
    const ticks = entities.values(Tick).filter((tick) => deployed.has(tick.poolId))
    if (pools.length === 0 && ticks.length === 0) return

    const chain = contractContext(height)

    await Promise.all([updatePoolFeeVars(chain, entities, pools), updateTickFeeVars(chain, entities, ticks)])
}

async function updateTickFeeVars(chain: ContractContext, entities: Entities, ticks: Tick[]): Promise<void> {
    if (ticks.length === 0) return

    // not all ticks are initialized so obtaining null is expected behavior
    const multicall = new Multicall(chain, MULTICALL_ADDRESS)

    const tickResult = await multicall.aggregate(
        poolAbi.functions.ticks,
        ticks.map<[string, {tick: bigint}]>((t) => {
            return [
                t.poolId,
                {
                    tick: t.tickIdx,
                },
            ]
        }),
        MULTICALL_PAGE_SIZE
    )

    for (let i = 0; i < ticks.length; i++) {
        ticks[i].feeGrowthOutside0X128 = tickResult[i].feeGrowthOutside0X128
        ticks[i].feeGrowthOutside1X128 = tickResult[i].feeGrowthOutside1X128
        entities.set(ticks[i])
    }
}

async function updatePoolFeeVars(chain: ContractContext, entities: Entities, pools: Pool[]): Promise<void> {
    if (pools.length === 0) return

    const multicall = new Multicall(chain, MULTICALL_ADDRESS)

    const calls: [string, {}][] = pools.map((p) => {
        return [p.id, {}]
    })
    const fee0 = await multicall.aggregate(poolAbi.functions.feeGrowthGlobal0X128, calls, MULTICALL_PAGE_SIZE)
    const fee1 = await multicall.aggregate(poolAbi.functions.feeGrowthGlobal1X128, calls, MULTICALL_PAGE_SIZE)

    for (let i = 0; i < pools.length; i++) {
        pools[i].feeGrowthGlobal0X128 = fee0[i]
        pools[i].feeGrowthGlobal1X128 = fee1[i]
        entities.set(pools[i])
    }
}

function tickId(poolId: string, tickIdx: number): string {
    return `${poolId}#${tickIdx}`
}
