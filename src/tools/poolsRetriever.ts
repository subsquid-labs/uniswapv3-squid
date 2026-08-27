/**
 * Builds ./assets/pools.json, the address manifest the main processor needs
 * before it can run its address-filtered passes.
 *
 * Portal caps a query at 256 KB, which is roughly MAX_ADDRESSES_PER_PASS
 * addresses. Covering more pools than that over one block range therefore takes
 * several passes, each a separate processor run over the same range. Passes are
 * sequential and share entity tables, so a pool's events must not be split
 * across them, and neither must the events of any token whose per-token
 * entities depend on event order.
 *
 * That gives the assignment rule implemented below:
 *
 *   pass 0  every pool whose two tokens are both whitelisted. These fix
 *           ethPriceUSD and the whitelist tokens' derivedETH, which every later
 *           pass reads as of the block it is processing, so they have to be
 *           indexed first. On mainnet this is a couple of hundred pools.
 *
 *   pass n  the rest, grouped so that all pools sharing a non-whitelisted token
 *           land together. Two non-whitelisted tokens are tied together by any
 *           pool that pairs them directly, so the unit of assignment is a
 *           connected component of that graph, not a single pool.
 *
 * The cutoff is then the largest prefix of pool history that still packs into
 * MAX_PASSES groups. Everything above it is covered by the wildcard request in
 * the main processor, which filters in RAM instead.
 */
import {DataSourceBuilder} from '@subsquid/evm-stream'
import assert from 'assert'
import {mkdir, writeFile} from 'fs/promises'
import * as factoryAbi from '../abi/factory'
import {FACTORY_ADDRESS, FACTORY_DEPLOYED_AT, MAX_ADDRESSES_PER_PASS} from '../utils/constants'
import {WHITELIST_TOKENS} from '../utils/pricing'
import {portalOptions} from '../utils/portal'

const MAX_PASSES = Number(process.env.MAX_PASSES || 5)
const OUT = './assets/pools.json'

interface PoolRecord {
    address: string
    token0: string
    token1: string
    block: number
}

export interface PoolsManifest {
    /** Last block covered by the address-filtered passes, inclusive. */
    height: number
    /** Pool addresses per pass, pass 0 first. */
    passes: string[][]
}

const whitelist = new Set(WHITELIST_TOKENS.map((t) => t.toLowerCase()))

async function collectPools(limit: number): Promise<PoolRecord[]> {
    const source = new DataSourceBuilder()
        .setPortal(portalOptions())
        .setBlockRange({from: FACTORY_DEPLOYED_AT})
        .setFields({log: {address: true, topics: true, data: true}})
        .addLog({where: {address: [FACTORY_ADDRESS], topic0: [factoryAbi.events.PoolCreated.topic]}})
        .build()

    const head = await source.getFinalizedHead()
    const pools: PoolRecord[] = []

    for await (const batch of source.getFinalizedStream({from: FACTORY_DEPLOYED_AT, to: head.number})) {
        for (const block of batch.blocks) {
            for (const log of block.logs ?? []) {
                const {token0, token1, pool} = factoryAbi.events.PoolCreated.decode(log)
                pools.push({
                    address: pool.toLowerCase(),
                    token0: token0.toLowerCase(),
                    token1: token1.toLowerCase(),
                    block: block.header.number,
                })
            }
        }
        // Stop once no prefix of what we have can still fit: packing needs at
        // least ceil(n / capacity) groups regardless of how the components fall.
        if (pools.length > limit) {
            console.log(`collected ${pools.length} pools, past the ${limit} that ${MAX_PASSES} passes can hold`)
            return pools
        }
    }

    console.log(`collected ${pools.length} pools up to the finalized head ${head.number}`)
    return pools
}

/** Union-find over the tokens that are not priced by pass 0. */
class Components {
    private parent = new Map<string, string>()

    find(x: string): string {
        if (!this.parent.has(x)) {
            this.parent.set(x, x)
            return x
        }
        let root: string = x
        while (true) {
            const next: string = this.parent.get(root)!
            if (next === root) break
            // Path halving: point each node at its grandparent as we climb.
            const above: string = this.parent.get(next)!
            this.parent.set(root, above)
            root = above
        }
        return root
    }

    union(a: string, b: string): void {
        const ra = this.find(a)
        const rb = this.find(b)
        if (ra !== rb) this.parent.set(ra, rb)
    }
}

/**
 * Splits `pools` into groups of at most MAX_ADDRESSES_PER_PASS, keeping every
 * pool that shares a non-whitelisted token in the same group. Returns undefined
 * when that needs more than `maxPasses` groups.
 */
function pack(pools: PoolRecord[], maxPasses: number): string[][] | undefined {
    const backbone: string[] = []
    const rest: PoolRecord[] = []
    for (const p of pools) {
        if (whitelist.has(p.token0) && whitelist.has(p.token1)) backbone.push(p.address)
        else rest.push(p)
    }

    const components = new Components()
    for (const p of rest) {
        // Only a pool pairing two unpriced tokens forces them into one group. A
        // pool against a whitelisted token does not: that side is already priced
        // by pass 0 as of any block.
        if (!whitelist.has(p.token0) && !whitelist.has(p.token1)) {
            components.union(p.token0, p.token1)
        }
    }

    const grouped = new Map<string, string[]>()
    for (const p of rest) {
        const unpriced = whitelist.has(p.token0) ? p.token1 : p.token0
        const key = components.find(unpriced)
        const group = grouped.get(key)
        if (group) group.push(p.address)
        else grouped.set(key, [p.address])
    }

    // Largest component first, so an oversized one fails fast rather than after
    // the small ones have been placed.
    const ordered = [...grouped.values()].sort((a, b) => b.length - a.length)
    if (ordered.length > 0 && ordered[0].length > MAX_ADDRESSES_PER_PASS) return undefined

    const backbonePass = backbone.length > 0 ? [backbone] : []
    const passes: string[][] = []
    for (const component of ordered) {
        const target = passes.find((p) => p.length + component.length <= MAX_ADDRESSES_PER_PASS)
        if (target) target.push(...component)
        else passes.push([...component])
        if (backbonePass.length + passes.length > maxPasses) return undefined
    }
    return [...backbonePass, ...passes]
}

async function main(): Promise<void> {
    const pools = await collectPools(MAX_PASSES * MAX_ADDRESSES_PER_PASS)
    assert(pools.length > 0, 'factory emitted no PoolCreated logs')

    // A pool prefix is only a valid cutoff at a block boundary: pools created in
    // the same block have to fall on the same side of it.
    const boundaries: number[] = []
    for (let i = 0; i < pools.length; i++) {
        if (i + 1 === pools.length || pools[i].block !== pools[i + 1].block) boundaries.push(i + 1)
    }

    let best: PoolsManifest | undefined
    let lo = 0
    let hi = boundaries.length - 1
    while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const count = boundaries[mid]
        const packed = pack(pools.slice(0, count), MAX_PASSES)
        if (packed) {
            best = {height: pools[count - 1].block, passes: packed}
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }
    assert(best, `could not fit even the earliest pools into ${MAX_PASSES} passes`)

    await mkdir('./assets', {recursive: true})
    await writeFile(OUT, JSON.stringify(best, null, 2))

    const covered = best.passes.reduce((n, p) => n + p.length, 0)
    console.log(`wrote ${OUT}`)
    console.log(`  cutoff height ${best.height}`)
    console.log(`  ${covered} pools over ${best.passes.length} passes`)
    best.passes.forEach((p, i) => {
        console.log(`    pass ${i}: ${p.length} pools${i === 0 ? ' (pricing backbone)' : ''}`)
    })
    console.log(`  pools above the cutoff are covered by the wildcard request`)
}

main().then(
    () => process.exit(0),
    (err) => {
        console.error(err)
        process.exit(1)
    },
)
