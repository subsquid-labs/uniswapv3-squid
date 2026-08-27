/**
 * Turns a batch of blocks into flat, decoded, chain-ordered event lists.
 *
 * This is the first level of the entity pipeline: it touches no entities and
 * reads nothing from the store, so everything downstream can be a pure function
 * of its output plus the entities loaded for it. Keeping decoding here is also
 * what lets the wildcard phase and the address-filtered passes share one set of
 * mappings - only this function knows that the `head` phase sees logs from
 * contracts the factory never created.
 */
import * as factoryAbi from '../abi/factory'
import * as poolAbi from '../abi/pool'
import * as positionsAbi from '../abi/NonfungiblePositionManager'
import {FACTORY_ADDRESS, POSITIONS_ADDRESS} from '../utils/constants'
import type {Block} from '../processor'
import type {PoolRegistry} from '../utils/poolRegistry'

export interface EventBase {
    blockNumber: number
    timestamp: number
    logIndex: number
    transaction: TransactionInfo
}

export interface TransactionInfo {
    hash: string
    from: string
    gasUsed: bigint
    gasPrice: bigint
}

export interface PoolCreatedEvent extends EventBase {
    poolId: string
    token0Id: string
    token1Id: string
    fee: number
}

export type PoolEvent = EventBase & {poolId: string} & (
        | {kind: 'Initialize'; tick: number; sqrtPrice: bigint}
        | {
              kind: 'Mint'
              amount0: bigint
              amount1: bigint
              amount: bigint
              tickLower: number
              tickUpper: number
              sender: string
              owner: string
          }
        | {
              kind: 'Burn'
              amount0: bigint
              amount1: bigint
              amount: bigint
              tickLower: number
              tickUpper: number
              owner: string
          }
        | {
              kind: 'Swap'
              amount0: bigint
              amount1: bigint
              tick: number
              sqrtPrice: bigint
              sender: string
              recipient: string
              liquidity: bigint
          }
    )

export type PositionEvent = EventBase &
    ({kind: 'IncreaseLiquidity'} | {kind: 'DecreaseLiquidity'} | {kind: 'Collect'} | {kind: 'Transfer'}) & {
        tokenId: bigint
        raw: {topics: string[]; data: string}
    }

export interface RawBatch {
    poolCreated: PoolCreatedEvent[]
    poolEvents: PoolEvent[]
    positionEvents: PositionEvent[]
}

const NO_TRANSACTION: TransactionInfo = {hash: '', from: '', gasUsed: 0n, gasPrice: 0n}

function transactionInfo(log: {getTransaction?: () => any; transactionHash?: string}): TransactionInfo {
    let tx: any
    try {
        tx = log.getTransaction?.()
    } catch {
        // The transaction was not requested for this log, or is unavailable.
    }
    if (tx == null) {
        return log.transactionHash ? {...NO_TRANSACTION, hash: log.transactionHash} : NO_TRANSACTION
    }
    return {
        hash: tx.hash ?? log.transactionHash ?? '',
        from: tx.from ?? '',
        gasUsed: tx.gasUsed ?? 0n,
        gasPrice: tx.gasPrice ?? 0n,
    }
}

/**
 * @param registry  known factory-created pools. In the wildcard phase a log
 *                  from an address that is not in here belongs to some other
 *                  protocol that happens to share Uniswap's event signatures,
 *                  and is dropped.
 * @param wildcard  true when pool logs were requested by topic alone, so they
 *                  still need the address check. In the address-filtered passes
 *                  Portal has already done it.
 */
export function extractEvents(blocks: Block[], registry: PoolRegistry, wildcard: boolean): RawBatch {
    const poolCreated: PoolCreatedEvent[] = []
    const poolEvents: PoolEvent[] = []
    const positionEvents: PositionEvent[] = []

    for (const block of blocks) {
        const base = {blockNumber: block.header.number, timestamp: block.header.timestamp}

        for (const log of block.logs) {
            const address = log.address.toLowerCase()
            const common = {...base, logIndex: log.logIndex, transaction: transactionInfo(log)}

            if (address === FACTORY_ADDRESS && log.topics[0] === factoryAbi.events.PoolCreated.topic) {
                const {token0, token1, fee, pool} = factoryAbi.events.PoolCreated.decode(log)
                const created: PoolCreatedEvent = {
                    ...common,
                    poolId: pool.toLowerCase(),
                    token0Id: token0.toLowerCase(),
                    token1Id: token1.toLowerCase(),
                    fee,
                }
                poolCreated.push(created)
                // Visible to the rest of this same batch: a pool can be created
                // and traded in one block.
                registry.add(created.poolId)
                continue
            }

            if (address === POSITIONS_ADDRESS) {
                const event = decodePositionEvent(log, common)
                if (event) positionEvents.push(event)
                continue
            }

            if (wildcard && !registry.has(address)) continue

            const event = decodePoolEvent(log, {...common, poolId: address})
            if (event) poolEvents.push(event)
        }
    }

    return {poolCreated, poolEvents, positionEvents}
}

function decodePoolEvent(log: any, common: EventBase & {poolId: string}): PoolEvent | undefined {
    switch (log.topics[0]) {
        case poolAbi.events.Initialize.topic: {
            const e = poolAbi.events.Initialize.decode(log)
            return {...common, kind: 'Initialize', tick: e.tick, sqrtPrice: e.sqrtPriceX96}
        }
        case poolAbi.events.Mint.topic: {
            const e = poolAbi.events.Mint.decode(log)
            return {
                ...common,
                kind: 'Mint',
                amount0: e.amount0,
                amount1: e.amount1,
                amount: e.amount,
                tickLower: e.tickLower,
                tickUpper: e.tickUpper,
                sender: e.sender.toLowerCase(),
                owner: e.owner.toLowerCase(),
            }
        }
        case poolAbi.events.Burn.topic: {
            const e = poolAbi.events.Burn.decode(log)
            return {
                ...common,
                kind: 'Burn',
                amount0: e.amount0,
                amount1: e.amount1,
                amount: e.amount,
                tickLower: e.tickLower,
                tickUpper: e.tickUpper,
                owner: e.owner.toLowerCase(),
            }
        }
        case poolAbi.events.Swap.topic: {
            const e = poolAbi.events.Swap.decode(log)
            return {
                ...common,
                kind: 'Swap',
                amount0: e.amount0,
                amount1: e.amount1,
                tick: e.tick,
                sqrtPrice: e.sqrtPriceX96,
                sender: e.sender.toLowerCase(),
                recipient: e.recipient.toLowerCase(),
                liquidity: e.liquidity,
            }
        }
        default:
            return undefined
    }
}

function decodePositionEvent(log: any, common: EventBase): PositionEvent | undefined {
    const raw = {topics: log.topics, data: log.data}
    switch (log.topics[0]) {
        case positionsAbi.events.IncreaseLiquidity.topic:
            return {...common, kind: 'IncreaseLiquidity', tokenId: positionsAbi.events.IncreaseLiquidity.decode(log).tokenId, raw}
        case positionsAbi.events.DecreaseLiquidity.topic:
            return {...common, kind: 'DecreaseLiquidity', tokenId: positionsAbi.events.DecreaseLiquidity.decode(log).tokenId, raw}
        case positionsAbi.events.Collect.topic:
            return {...common, kind: 'Collect', tokenId: positionsAbi.events.Collect.decode(log).tokenId, raw}
        case positionsAbi.events.Transfer.topic:
            return {...common, kind: 'Transfer', tokenId: positionsAbi.events.Transfer.decode(log).tokenId, raw}
        default:
            return undefined
    }
}
