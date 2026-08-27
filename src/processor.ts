/**
 * Data sources for the two-phase factory indexing scheme.
 *
 * Uniswap V3 has far more pools than the ~5.5k addresses that fit in Portal's
 * 256 KB query budget, so the pre-cutoff history is covered by several
 * address-filtered *passes*. Each pass is its own processor run over the same
 * block range, with its own progress schema, writing into the shared entity
 * tables. `assets/pools.json` says which pools belong to which pass; see
 * `src/tools/poolsRetriever.ts` for how that split is chosen.
 *
 * Above the cutoff the pool set is not known ahead of time, so the `head`
 * source subscribes to the pool events by topic alone and the batch handler
 * discards logs from addresses the factory did not create.
 */
import {EvmFallbackDataSourceBuilder} from '@subsquid/squid-sdk/evm/fallback'
import type {FieldSelection} from '@subsquid/evm-stream'
import type {DataHandlerContext} from '@subsquid/batch-processor'
import type {AugmentedBlock} from '@subsquid/evm-objects'
import type {Store} from '@subsquid/typeorm-store'
import assert from 'assert'
import fs from 'fs'
import * as factoryAbi from './abi/factory'
import * as poolAbi from './abi/pool'
import * as positionsAbi from './abi/NonfungiblePositionManager'
import {FACTORY_ADDRESS, FACTORY_DEPLOYED_AT, POSITIONS_ADDRESS} from './utils/constants'
import {portalOptions} from './utils/portal'
import type {PoolsManifest} from './tools/poolsRetriever'

export const NETWORK = 'ethereum-mainnet'

export const manifest: PoolsManifest = JSON.parse(fs.readFileSync('./assets/pools.json', 'utf-8'))

assert(
    Array.isArray(manifest.passes),
    'assets/pools.json predates the multi-pass layout - regenerate it with `sqd get-pools`',
)

const POOL_EVENT_TOPICS = [
    poolAbi.events.Burn.topic,
    poolAbi.events.Mint.topic,
    poolAbi.events.Initialize.topic,
    poolAbi.events.Swap.topic,
]

const POSITION_EVENT_TOPICS = [
    positionsAbi.events.IncreaseLiquidity.topic,
    positionsAbi.events.DecreaseLiquidity.topic,
    positionsAbi.events.Collect.topic,
    positionsAbi.events.Transfer.topic,
]

export const fields = {
    block: {timestamp: true},
    transaction: {from: true, value: true, hash: true, gasUsed: true, gasPrice: true},
    log: {address: true, topics: true, data: true, transactionHash: true},
} satisfies FieldSelection

/** `pass0`..`passN` replay the pre-cutoff range; `head` follows the chain. */
export type Phase = {kind: 'pass'; index: number} | {kind: 'head'}

export function parsePhase(arg: string | undefined): Phase {
    if (arg === 'head') return {kind: 'head'}
    const m = /^pass(\d+)$/.exec(arg ?? '')
    assert(m, `expected one of ${phaseNames().join(', ')}, got ${arg ?? '<nothing>'}`)
    const index = Number(m[1])
    assert(index < manifest.passes.length, `pass ${index} is not in assets/pools.json`)
    return {kind: 'pass', index}
}

export function phaseNames(): string[] {
    return [...manifest.passes.map((_, i) => `pass${i}`), 'head']
}

export function phaseName(phase: Phase): string {
    return phase.kind === 'head' ? 'head' : `pass${phase.index}`
}

function downstreamSources() {
    const rpc = process.env.RPC_ETH_HTTP
    return [
        {type: 'portal' as const, ...portalOptions()},
        ...(rpc ? [{type: 'rpc' as const, url: rpc, network: NETWORK}] : []),
    ]
}

export function createDataSource(phase: Phase) {
    const builder = new EvmFallbackDataSourceBuilder().setDownstreamSources(downstreamSources()).setFields(fields)

    if (phase.kind === 'head') {
        // The factory keeps emitting past the cutoff, so new pools are still
        // discovered here - they just get filtered in RAM rather than in the query.
        builder
            .addLog({
                where: {address: [FACTORY_ADDRESS], topic0: [factoryAbi.events.PoolCreated.topic]},
                include: {transaction: true},
                range: {from: manifest.height + 1},
            })
            .addLog({
                where: {topic0: POOL_EVENT_TOPICS},
                include: {transaction: true},
                range: {from: manifest.height + 1},
            })
            .addLog({
                where: {address: [POSITIONS_ADDRESS], topic0: POSITION_EVENT_TOPICS},
                include: {transaction: true},
                range: {from: manifest.height + 1},
            })
        return builder.build()
    }

    const range = {from: FACTORY_DEPLOYED_AT, to: manifest.height}

    // Pass 0 is the only one that indexes the factory and the position manager.
    // It creates every Pool and Token row in the manifest, so later passes can
    // assume the metadata for their own pools is already there, and it avoids
    // replaying the same position history once per pass.
    if (phase.index === 0) {
        builder
            .addLog({
                where: {address: [FACTORY_ADDRESS], topic0: [factoryAbi.events.PoolCreated.topic]},
                include: {transaction: true},
                range,
            })
            .addLog({
                where: {address: [POSITIONS_ADDRESS], topic0: POSITION_EVENT_TOPICS},
                include: {transaction: true},
                range,
            })
    }

    builder.addLog({
        where: {address: manifest.passes[phase.index], topic0: POOL_EVENT_TOPICS},
        include: {transaction: true},
        range,
    })

    return builder.build()
}

export type DataSource = ReturnType<typeof createDataSource>
export type RawBlock = DataSource extends {getStream(...args: any[]): AsyncIterable<{blocks: (infer B)[]}>} ? B : never
export type Block = AugmentedBlock<RawBlock>
export type Log = Block['logs'][number]
export type Transaction = Block['transactions'][number]
export type Context = DataHandlerContext<RawBlock, Store>
