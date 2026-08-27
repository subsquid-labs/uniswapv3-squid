/**
 * Level 3 - positions.
 *
 * Positions sit at the bottom of the entity graph: every one of them refers to
 * a Pool and to the two Tokens that pool trades, all of which exist by the time
 * this runs. The NFT id itself is the only thing the logs carry, so a position
 * that has never been seen before has to be resolved against the position
 * manager and the factory - one batched contract read for the whole batch,
 * done once in the load step rather than per event.
 *
 * The load step states everything this level reads, in dependency order:
 * positions first, then the tokens *those* positions name. Nothing below it
 * touches the store.
 */
import {BigDecimal} from '@subsquid/big-decimal'

import {Multicall} from '../abi/multicall'
import * as factoryAbi from '../abi/factory'
import * as positionsAbi from '../abi/NonfungiblePositionManager'
import {Position, PositionSnapshot, Token, Tx} from '../model'
import type {Context} from '../processor'
import {
    ADDRESS_ZERO,
    FACTORY_ADDRESS,
    MULTICALL_ADDRESS,
    MULTICALL_PAGE_SIZE,
    POSITIONS_ADDRESS,
    SKIPPED_DECREASE_LIQUIDITY_BLOCKS,
    SKIPPED_POSITION_POOLS,
} from '../utils/constants'
import type {Entities} from '../utils/entities'
import {contractContext} from '../utils/rpc'
import type {PositionEvent} from './extract'

export async function applyPositionEvents(
    ctx: Context,
    entities: Entities,
    events: PositionEvent[]
): Promise<void> {
    if (events.length === 0) return

    await load(entities, events)

    for (const event of events) {
        switch (event.kind) {
            case 'IncreaseLiquidity':
                applyIncreaseLiquidity(entities, event)
                break
            case 'DecreaseLiquidity':
                applyDecreaseLiquidity(entities, event)
                break
            case 'Collect':
                applyCollect(entities, event)
                break
            case 'Transfer':
                applyTransfer(entities, event)
                break
        }
    }
}

/**
 * Two hops. The ids of the positions the batch touches are known from the
 * events; the ids of the tokens are not - they are a property of the position,
 * so the second hop can only be issued once the first one has come back and the
 * positions that were missing from it have been resolved on chain.
 */
async function load(entities: Entities, events: PositionEvent[]): Promise<void> {
    const positionIds = new Set<string>()
    const txIds = new Set<string>()
    const snapshotIds = new Set<string>()

    for (const event of events) {
        const positionId = event.tokenId.toString()
        positionIds.add(positionId)
        txIds.add(event.transaction.hash)
        snapshotIds.add(snapshotId(positionId, event.blockNumber))
    }

    await entities.load(Position, positionIds)

    // Anything the store does not have has never been indexed: an NFT id only
    // becomes a Position row here, and its pool and tokens live on chain.
    const newPositionIds: string[] = []
    for (const id of positionIds) {
        if (!entities.has(Position, id)) newPositionIds.push(id)
    }

    const height = events[events.length - 1].blockNumber
    for (const position of await initPositions(newPositionIds, height)) {
        entities.set(position)
    }

    // Second hop, widened over every position in the working set - the ones
    // just created and the ones that came back from the store alike.
    const tokenIds = new Set<string>()
    for (const position of entities.values(Position)) {
        tokenIds.add(position.token0Id)
        tokenIds.add(position.token1Id)
    }

    await entities.load(Token, tokenIds)
    await entities.load(Tx, txIds)
    await entities.load(PositionSnapshot, snapshotIds)
}

/**
 * Resolves brand new NFT ids into Position rows.
 *
 * Two batched reads for the whole batch, not one pair per event: `positions()`
 * on the position manager gives the token pair and the fee tier, and the fee
 * tier is what the factory needs to name the pool. State is read at the height
 * of the last event in the batch, so the two rounds see the same chain state.
 */
async function initPositions(ids: string[], height: number): Promise<Position[]> {
    if (ids.length === 0) return []

    const multicall = new Multicall(contractContext(height), MULTICALL_ADDRESS)

    const positionResults = await multicall.tryAggregate(
        positionsAbi.functions.positions,
        POSITIONS_ADDRESS,
        ids.map((id) => {
            return {tokenId: BigInt(id)}
        }),
        MULTICALL_PAGE_SIZE
    )

    const positionsData: {
        positionId: string
        token0Id: string
        token1Id: string
        fee: number
    }[] = []
    for (let i = 0; i < ids.length; i++) {
        const result = positionResults[i]
        if (result.success) {
            positionsData.push({
                positionId: ids[i].toLowerCase(),
                token0Id: result.value.token0.toLowerCase(),
                token1Id: result.value.token1.toLowerCase(),
                fee: result.value.fee,
            })
        }
    }

    const poolIds = await multicall.aggregate(
        factoryAbi.functions.getPool,
        FACTORY_ADDRESS,
        positionsData.map((p) => {
            return {
                tokenA: p.token0Id,
                tokenB: p.token1Id,
                fee: p.fee,
            }
        }),
        MULTICALL_PAGE_SIZE
    )

    const positions: Position[] = []
    for (let i = 0; i < positionsData.length; i++) {
        const position = createPosition(positionsData[i].positionId)
        position.token0Id = positionsData[i].token0Id
        position.token1Id = positionsData[i].token1Id
        position.poolId = poolIds[i].toLowerCase()

        // Inherited skip; see SKIPPED_POSITION_POOLS for what is and is not
        // known about it. Logged so the gap is visible rather than silent.
        if (SKIPPED_POSITION_POOLS.has(position.poolId)) {
            console.warn(`skipping position ${position.id}: pool ${position.poolId} is in SKIPPED_POSITION_POOLS`)
            continue
        }

        positions.push(position)
    }

    return positions
}

function applyIncreaseLiquidity(entities: Entities, event: PositionEvent): void {
    const position = entities.get(Position, event.tokenId.toString())
    if (position == null) return

    const data = positionsAbi.events.IncreaseLiquidity.decode(event.raw)

    const token0 = entities.get(Token, position.token0Id)
    const token1 = entities.get(Token, position.token1Id)

    if (!token0 || !token1) return

    const amount0 = BigDecimal(data.amount0, token0.decimals).toNumber()
    const amount1 = BigDecimal(data.amount1, token1.decimals).toNumber()

    position.liquidity = position.liquidity + data.liquidity
    position.depositedToken0 = position.depositedToken0 + amount0
    position.depositedToken1 = position.depositedToken1 + amount1

    entities.set(position)
    updatePositionSnapshot(entities, event, position)
}

function applyDecreaseLiquidity(entities: Entities, event: PositionEvent): void {
    // Inherited skip; see SKIPPED_DECREASE_LIQUIDITY_BLOCKS.
    if (SKIPPED_DECREASE_LIQUIDITY_BLOCKS.has(event.blockNumber)) {
        console.warn(`skipping DecreaseLiquidity at block ${event.blockNumber}: block is in SKIPPED_DECREASE_LIQUIDITY_BLOCKS`)
        return
    }

    const position = entities.get(Position, event.tokenId.toString())
    if (position == null) return

    const data = positionsAbi.events.DecreaseLiquidity.decode(event.raw)

    const token0 = entities.get(Token, position.token0Id)
    const token1 = entities.get(Token, position.token1Id)

    if (!token0 || !token1) return

    const amount0 = BigDecimal(data.amount0, token0.decimals).toNumber()
    const amount1 = BigDecimal(data.amount1, token1.decimals).toNumber()

    position.liquidity = position.liquidity - data.liquidity
    position.withdrawnToken0 = position.withdrawnToken0 + amount0
    position.withdrawnToken1 = position.withdrawnToken1 + amount1

    entities.set(position)
    updatePositionSnapshot(entities, event, position)
}

function applyCollect(entities: Entities, event: PositionEvent): void {
    const position = entities.get(Position, event.tokenId.toString())
    // position was not able to be fetched
    if (position == null) return

    const data = positionsAbi.events.Collect.decode(event.raw)

    const token0 = entities.get(Token, position.token0Id)
    const token1 = entities.get(Token, position.token1Id)
    if (token0 == null || token1 == null) return
    const amount0 = BigDecimal(data.amount0, token0.decimals).toNumber()
    const amount1 = BigDecimal(data.amount1, token1.decimals).toNumber()

    position.collectedFeesToken0 = position.collectedFeesToken0 + amount0
    position.collectedFeesToken1 = position.collectedFeesToken1 + amount1

    entities.set(position)
    updatePositionSnapshot(entities, event, position)
}

function applyTransfer(entities: Entities, event: PositionEvent): void {
    const position = entities.get(Position, event.tokenId.toString())

    // position was not able to be fetched
    if (position == null) return

    const data = positionsAbi.events.Transfer.decode(event.raw)

    position.owner = data.to.toLowerCase()

    entities.set(position)
    updatePositionSnapshot(entities, event, position)
}

function updatePositionSnapshot(entities: Entities, event: PositionEvent, position: Position): void {
    const positionBlockId = snapshotId(position.id, event.blockNumber)

    let positionSnapshot = entities.get(PositionSnapshot, positionBlockId)
    if (!positionSnapshot) {
        positionSnapshot = new PositionSnapshot({id: positionBlockId})
    }
    positionSnapshot.owner = position.owner
    positionSnapshot.poolId = position.poolId
    positionSnapshot.positionId = position.id
    positionSnapshot.blockNumber = event.blockNumber
    positionSnapshot.timestamp = new Date(event.timestamp)
    positionSnapshot.liquidity = position.liquidity
    positionSnapshot.depositedToken0 = position.depositedToken0
    positionSnapshot.depositedToken1 = position.depositedToken1
    positionSnapshot.withdrawnToken0 = position.withdrawnToken0
    positionSnapshot.withdrawnToken1 = position.withdrawnToken1
    positionSnapshot.collectedFeesToken0 = position.collectedFeesToken0
    positionSnapshot.collectedFeesToken1 = position.collectedFeesToken1
    positionSnapshot.transactionId = getOrCreateTransaction(entities, event).id
    positionSnapshot.feeGrowthInside0LastX128 = position.feeGrowthInside0LastX128
    positionSnapshot.feeGrowthInside1LastX128 = position.feeGrowthInside1LastX128

    entities.set(positionSnapshot)
}

/**
 * A snapshot references the transaction it was taken in, and that row is not
 * guaranteed to be written by any other level: a position event and the pool
 * event it accompanies can belong to different passes. The row is upserted with
 * the same contents wherever it is written from, so producing it here is safe.
 */
function getOrCreateTransaction(entities: Entities, event: PositionEvent): Tx {
    let transaction = entities.get(Tx, event.transaction.hash)
    if (!transaction) {
        transaction = new Tx({
            id: event.transaction.hash,
            blockNumber: event.blockNumber,
            timestamp: new Date(event.timestamp),
            gasUsed: event.transaction.gasUsed,
            gasPrice: event.transaction.gasPrice,
        })
        entities.set(transaction)
    }
    return transaction
}

function createPosition(positionId: string): Position {
    const position = new Position({id: positionId})

    position.owner = ADDRESS_ZERO
    position.liquidity = 0n
    position.depositedToken0 = 0
    position.depositedToken1 = 0
    position.withdrawnToken0 = 0
    position.withdrawnToken1 = 0
    position.collectedFeesToken0 = 0
    position.collectedFeesToken1 = 0
    position.feeGrowthInside0LastX128 = 0n
    position.feeGrowthInside1LastX128 = 0n

    return position
}

function snapshotId(positionId: string, block: number): string {
    return `${positionId}#${block}`
}
