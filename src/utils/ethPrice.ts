import type {Store} from '@subsquid/typeorm-store'
import {Between, LessThan} from 'typeorm'
import {EthPrice, Pool} from '../model'
import {USDC_WETH_03_POOL} from './pricing'
import type {Entities} from './entities'

/**
 * The ETH/USD price in effect at a given log.
 *
 * Every USD figure in the schema is derived from this one number, and it is the
 * only value the passes share: `Token.derivedETH` for a whitelisted token is a
 * function of it, and every other token is priced against a pool that lives in
 * its own pass. Getting it right as of the log being processed is therefore
 * what makes a multi-pass sync agree with a single-pass one.
 */
export interface EthPriceSource {
    at(blockNumber: number, logIndex: number): number
    /** True when this phase is the one recording the series. */
    readonly records: boolean
}

/**
 * For the phase that indexes the pricing pool, the live pool row is the price -
 * it is being updated in chronological order as events are processed, which is
 * exactly the original single-pass behaviour.
 */
export class LiveEthPrice implements EthPriceSource {
    readonly records = true

    constructor(private entities: Entities) {}

    at(): number {
        return this.entities.get(Pool, USDC_WETH_03_POOL)?.token0Price || 0
    }
}

/**
 * For every other pass, the price comes from the series the pricing phase
 * recorded. Only the points covering the batch are held, plus the one in force
 * when the batch starts, so this stays O(batch) regardless of how long the
 * history is.
 */
export class RecordedEthPrice implements EthPriceSource {
    readonly records = false

    private constructor(private points: {blockNumber: number; logIndex: number; priceUSD: number}[]) {}

    static async load(store: Store, fromBlock: number, toBlock: number): Promise<RecordedEthPrice> {
        // A range scan, not an id lookup, so it goes to the store directly
        // rather than through the id-keyed working set.
        const carry = await store.find(EthPrice, {
            where: {blockNumber: LessThan(fromBlock)},
            order: {blockNumber: 'DESC', logIndex: 'DESC'},
            take: 1,
        })
        const inBatch = await store.find(EthPrice, {
            where: {blockNumber: Between(fromBlock, toBlock)},
            order: {blockNumber: 'ASC', logIndex: 'ASC'},
        })
        return new RecordedEthPrice([...carry, ...inBatch])
    }

    at(blockNumber: number, logIndex: number): number {
        const points = this.points
        let lo = 0
        let hi = points.length - 1
        let found = -1
        while (lo <= hi) {
            const mid = (lo + hi) >> 1
            const p = points[mid]
            if (p.blockNumber < blockNumber || (p.blockNumber === blockNumber && p.logIndex <= logIndex)) {
                found = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        // Nothing recorded yet means the pricing pool had not traded, which is
        // the same 0 the single-pass code starts with.
        return found < 0 ? 0 : points[found].priceUSD
    }
}

export function ethPriceId(blockNumber: number, logIndex: number): string {
    return `${blockNumber}-${logIndex}`
}
