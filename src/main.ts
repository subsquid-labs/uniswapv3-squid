/**
 * Entry point for every phase of the indexer.
 *
 *   node lib/main.js pass0     replays the pre-cutoff range for pass 0's pools
 *   node lib/main.js pass1     ... and so on, one run per pass, in order
 *   node lib/main.js head      follows the chain above the cutoff
 *
 * The passes exist because Portal caps a query at 256 KB, so only ~5.5k pool
 * addresses fit in one. They are separate runs rather than one run with several
 * requests because the SDK unions same-range address filters into a single
 * query, which would hit that cap again. Each phase keeps its own progress in
 * its own schema and they all write the same entity tables, so they must be run
 * in order and each to completion. See src/processor.ts.
 *
 * Within a batch the work is organised as a topological sort over the entity
 * graph rather than as per-event handlers behind a lazily-populated cache:
 * every level is computed from levels already built, and each is loaded and
 * saved in bulk. Nothing reads the store on demand in the middle of processing.
 */
import {run} from '@subsquid/batch-processor'
import {augmentBlock} from '@subsquid/evm-objects'
import {TypeormDatabase} from '@subsquid/typeorm-store'
import {createDataSource, manifest, parsePhase, phaseName, type Block} from './processor'
import {extractEvents} from './mappings/extract'
import {createPoolsAndTokens} from './mappings/factory'
import {applyPoolEvents} from './mappings/core'
import {applyPositionEvents} from './mappings/positionManager'
import {Entities} from './utils/entities'
import {PoolRegistry} from './utils/poolRegistry'
import {
    Bundle,
    Burn,
    Collect,
    EthPrice,
    Factory,
    Flash,
    Mint,
    Pool,
    PoolDayData,
    PoolHourData,
    Position,
    PositionSnapshot,
    Swap,
    Tick,
    TickDayData,
    Token,
    TokenDayData,
    TokenHourData,
    Tx,
    UniswapDayData,
} from './model'

const phase = parsePhase(process.argv[2])
const dataSource = createDataSource(phase)

const db = new TypeormDatabase({
    // One progress schema per phase: the passes each replay the same block
    // range, so they cannot share a status row.
    stateSchema: `sqd_${phaseName(phase)}`,
    // Only the head phase sees unfinalized blocks; the passes stop at the
    // cutoff, which is far below any reorg.
    supportHotBlocks: phase.kind === 'head',
})

// Every pool at or below the cutoff is already known from the manifest, so the
// registry starts warm and only has to track what the factory emits above it.
const registry = new PoolRegistry(
    manifest.passes.flat(),
    manifest.height,
)

run(dataSource, db, async (ctx) => {
    const blocks: Block[] = ctx.blocks.map(augmentBlock)
    if (blocks.length === 0) return

    // Only the wildcard phase consults the registry, and only it can see a
    // fork, so the passes skip the per-batch refresh entirely.
    if (phase.kind === 'head') {
        await registry.sync(ctx.store, blocks[blocks.length - 1].header.number)
    }

    // Level 0 - decode. Pure function of the batch.
    const raw = extractEvents(blocks, registry, phase.kind === 'head')
    if (raw.poolCreated.length === 0 && raw.poolEvents.length === 0 && raw.positionEvents.length === 0) return

    const entities = new Entities(ctx.store)

    // Level 1 - Tokens and Pools. Everything below refers to these, and the
    // factory logs are the only place they come from.
    await createPoolsAndTokens(ctx, entities, raw.poolCreated)

    // Level 2 - pool state, ticks, and the swap/mint/burn history, plus the
    // day and hour rollups that are derived from them.
    await applyPoolEvents(ctx, entities, raw.poolEvents, phase)

    // Level 3 - positions, which reference the pools and tokens above.
    await applyPositionEvents(ctx, entities, raw.positionEvents)

    // Persist parents before children so foreign keys always resolve.
    await entities.persist([
        Bundle,
        // Standalone: referenced by no other entity, and every later pass reads
        // it back as the ETH price at the log it is processing.
        EthPrice,
        Factory,
        Token,
        Pool,
        Tick,
        Tx,
        Mint,
        Burn,
        Swap,
        Collect,
        Flash,
        Position,
        PositionSnapshot,
        UniswapDayData,
        PoolDayData,
        PoolHourData,
        TokenDayData,
        TokenHourData,
        TickDayData,
    ])
})
