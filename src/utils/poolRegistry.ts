import {MoreThan} from 'typeorm'
import type {Store} from '@subsquid/typeorm-store'
import {Pool} from '../model'
import {POOL_REGISTRY_REORG_DEPTH} from './constants'

/**
 * The set of addresses the factory has created, used to tell our pools' logs
 * apart from every other contract's in the wildcard phase.
 *
 * Holding this set in memory across batches is what makes the wildcard phase
 * affordable, but a plain cache is wrong near the head: a pool created in a
 * block that is later orphaned stays in the set forever, and the squid then
 * accepts events from a contract that does not exist on the canonical chain.
 * The store rolls its rows back on a fork, so the database is right and only
 * the cache is stale.
 *
 * Re-reading every pool each batch would fix that at the cost of a full scan of
 * a table with tens of thousands of rows. Instead the set is split at the reorg
 * horizon:
 *
 *   - everything up to the manifest cutoff is seeded from `assets/pools.json`,
 *     so the bulk of the set costs no query at all;
 *   - pools created between the cutoff and the horizon are read once and then
 *     cached, since a fork can no longer reach them;
 *   - the shallow tail above the horizon is re-read on every batch, and is at
 *     most POOL_REGISTRY_REORG_DEPTH blocks' worth of creations.
 */
export class PoolRegistry {
    private finalized: Set<string>
    /** Every pool created at or below this height is in `finalized`. */
    private finalizedUpTo: number
    /** Pools created above `finalizedUpTo`; rebuilt from the store each batch. */
    private recent = new Set<string>()

    constructor(seed: Iterable<string>, seedHeight: number) {
        this.finalized = new Set(seed)
        this.finalizedUpTo = seedHeight
    }

    async sync(store: Store, headBlock: number): Promise<void> {
        const horizon = headBlock - POOL_REGISTRY_REORG_DEPTH

        if (horizon > this.finalizedUpTo) {
            // These are now too deep to be orphaned, so they move into the
            // permanent set and are never queried again.
            for (const pool of await store.findBy(Pool, {createdAtBlockNumber: MoreThan(this.finalizedUpTo)})) {
                if (pool.createdAtBlockNumber <= horizon) this.finalized.add(pool.id)
            }
            this.finalizedUpTo = horizon
        }

        const tail = await store.findBy(Pool, {createdAtBlockNumber: MoreThan(this.finalizedUpTo)})
        this.recent = new Set(tail.map((pool) => pool.id))
    }

    /** Registers a pool created in the batch currently being processed. */
    add(address: string): void {
        this.recent.add(address)
    }

    has(address: string): boolean {
        return this.finalized.has(address) || this.recent.has(address)
    }

    get size(): number {
        return this.finalized.size + this.recent.size
    }
}
