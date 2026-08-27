/**
 * Turns the bucket TVL deltas the passes accumulated into TVL levels.
 *
 * A bucket that samples a running accumulator - `UniswapDayData.tvlUSD` from
 * the factory's, the token buckets' `totalValueLocked*` from their token's -
 * records a number that is already incomplete when it is written: the passes
 * that still have to replay the range have not added their share yet, and a
 * pass cannot be made to run "after" the others for every bucket at once. TVL
 * is a stock, so it cannot be counted per bucket the way `txCount` is either.
 *
 * What each bucket *can* count is the change its own events caused, which is a
 * flow and therefore order-independent no matter which pass sees it. That is
 * what `accumulateTvlDeltas` in src/mappings/core.ts writes. Once every pass
 * has finished, the levels are a prefix sum of those deltas along the series,
 * which is what this script computes.
 *
 * Only the pre-cutoff buckets actually need it: above the cutoff there is a
 * single chronological phase and the accumulators it samples are already
 * complete, so `head` writes correct levels by itself. Rewriting those rows is
 * harmless anyway - the head phase accumulates the same deltas, so the prefix
 * sum lands on the value it sampled - and the script only reads the deltas, so
 * re-running it over the whole range as often as you like is idempotent.
 *
 * Run it after the passes and before (or during) `head`: `sqd finalize`.
 */
import {DataSource} from 'typeorm'
import {USDC_WETH_03_POOL} from '../utils/pricing'

/** Buckets read and written per round trip. */
const BATCH_SIZE = 5000

/**
 * Tokens whose buckets are fetched in one query. The prefix sum runs per token,
 * so a whole token's series has to be in memory at once; batching a handful of
 * tokens together cuts the round trips without letting that grow unbounded.
 */
const TOKEN_CHUNK = 25

/** Every bucket row this script reads is keyed by id and ordered by date. */
interface Row {
    id: string
    date: Date
}

function createDataSource(): DataSource {
    // The same DB_* variables @subsquid/typeorm-store reads, with the same
    // defaults. This script talks to the tables directly: the store's writes
    // only make sense inside a processor run, and a prefix sum over millions of
    // rows is a scan rather than an id-keyed working set.
    const common = {
        type: 'postgres' as const,
        // DB_SCHEMA moves the entity tables out of `public`, so unqualified
        // names in the statements below have to follow it.
        extra: process.env.DB_SCHEMA ? {options: `-c search_path="${process.env.DB_SCHEMA}"`} : undefined,
    }

    if (process.env.DB_URL) {
        return new DataSource({...common, url: process.env.DB_URL})
    }

    return new DataSource({
        ...common,
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'postgres',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASS || 'postgres',
    })
}

/**
 * Applies computed levels to `table`, one statement per chunk of rows.
 *
 * `rows` are `[id, ...values]` in `columns` order. Passing them as a VALUES
 * list keeps this to a single round trip per batch instead of one UPDATE per
 * bucket, which matters at TokenHourData's scale.
 */
async function writeLevels(
    db: DataSource,
    table: string,
    columns: string[],
    rows: (string | number)[][]
): Promise<void> {
    if (rows.length === 0) return

    const params: (string | number)[] = []
    const tuples = rows.map((row) => {
        const cells = row.map((value, i) => {
            params.push(value)
            // The columns are `numeric`; float8 is what the indexer put in them
            // and assigning it back keeps the same shortest round-trip text.
            return `$${params.length}::${i === 0 ? 'text' : 'float8'}`
        })
        return `(${cells.join(', ')})`
    })

    const quoted = columns.map((c) => `"${c}"`)
    const assignments = quoted.map((c) => `${c} = v.${c}`).join(', ')

    await db.query(
        `UPDATE "${table}" AS t SET ${assignments} ` +
            `FROM (VALUES ${tuples.join(', ')}) AS v("id", ${quoted.join(', ')}) ` +
            `WHERE t."id" = v."id"`,
        params
    )
}

/**
 * The ETH/USD price at each day's close, from the pricing pool's own day
 * buckets. Those are exact already: a pool lives in exactly one pass, so its
 * buckets are written in order by a single writer.
 */
async function loadEthPriceByDay(db: DataSource): Promise<Map<number, number>> {
    const rows: {date: Date; close: string}[] = await db.query(
        `SELECT "date", "close" FROM "pool_day_data" WHERE "pool_id" = $1 ORDER BY "date"`,
        [USDC_WETH_03_POOL]
    )

    const prices = new Map<number, number>()
    for (const row of rows) prices.set(row.date.getTime(), Number(row.close))
    console.log(`  pricing pool ${USDC_WETH_03_POOL}: ${prices.size} day closes`)
    return prices
}

async function finalizeUniswapDayData(db: DataSource): Promise<number> {
    console.log('uniswap_day_data')
    const prices = await loadEthPriceByDay(db)

    let runningTvlETH = 0
    // Carried forward from the last day the pricing pool traded: a day with no
    // row for it did not move the price, it just has no observation of its own.
    let lastPrice = 0
    let scanned = 0
    let updated = 0
    let unpriced = 0

    let cursor: {date: Date; id: string} | undefined
    let pending: (string | number)[][] = []

    for (;;) {
        const rows: (Row & {tvl_usd: string; tvl_eth_delta: string})[] = await db.query(
            `SELECT "id", "date", "tvl_usd", "tvl_eth_delta" FROM "uniswap_day_data" ` +
                (cursor ? `WHERE ("date", "id") > ($2::timestamptz, $3::text) ` : '') +
                `ORDER BY "date", "id" LIMIT $1`,
            cursor ? [BATCH_SIZE, cursor.date, cursor.id] : [BATCH_SIZE]
        )
        if (rows.length === 0) break

        for (const row of rows) {
            runningTvlETH += Number(row.tvl_eth_delta)

            const price = prices.get(row.date.getTime())
            if (price != null && price > 0) lastPrice = price

            // Before the pricing pool's first trade there is no ETH price to
            // convert with, so the day is left as the indexer wrote it.
            if (lastPrice === 0) {
                unpriced++
                continue
            }

            const tvlUSD = runningTvlETH * lastPrice
            if (Number(row.tvl_usd) !== tvlUSD) pending.push([row.id, tvlUSD])
        }

        scanned += rows.length
        cursor = rows[rows.length - 1]

        if (pending.length >= BATCH_SIZE) {
            await writeLevels(db, 'uniswap_day_data', ['tvl_usd'], pending)
            updated += pending.length
            pending = []
        }
    }

    await writeLevels(db, 'uniswap_day_data', ['tvl_usd'], pending)
    updated += pending.length

    console.log(`  ${scanned} days scanned, ${updated} updated, ${unpriced} left alone for want of an ETH price`)
    return updated
}

/**
 * Prefix-sums one token bucket table. Both tables have the same shape, and the
 * series is per token: `totalValueLocked` is that token's own accumulator, and
 * `close` - the token's USD price at the end of the bucket - is exact already,
 * being an argmax over the bucket rather than a sample of a running value.
 */
async function finalizeTokenBuckets(db: DataSource, table: string): Promise<number> {
    console.log(table)

    const tokens: {id: string}[] = await db.query(`SELECT "id" FROM "token" ORDER BY "id"`)
    console.log(`  ${tokens.length} tokens`)

    let scanned = 0
    let updated = 0
    let pending: (string | number)[][] = []

    for (let i = 0; i < tokens.length; i += TOKEN_CHUNK) {
        const chunk = tokens.slice(i, i + TOKEN_CHUNK).map((t) => t.id)

        // Ordered by token first, so each token's series arrives contiguously
        // and the running sums reset on the boundary.
        const rows: (Row & {
            token_id: string
            close: string
            total_value_locked: string
            total_value_locked_usd: string
            tvl_delta: string
        })[] = await db.query(
            `SELECT "id", "date", "token_id", "close", "total_value_locked", "total_value_locked_usd", "tvl_delta" ` +
                `FROM "${table}" WHERE "token_id" = ANY($1::text[]) ORDER BY "token_id", "date"`,
            [chunk]
        )

        let currentToken: string | undefined
        let runningTvl = 0
        let lastClose = 0

        for (const row of rows) {
            if (row.token_id !== currentToken) {
                currentToken = row.token_id
                runningTvl = 0
                lastClose = 0
            }

            runningTvl += Number(row.tvl_delta)

            // A bucket with no valid price observation keeps the last one seen;
            // before the first, the USD figure is simply unknown and stays 0.
            const close = Number(row.close)
            if (close > 0) lastClose = close

            const totalValueLocked = runningTvl
            const totalValueLockedUSD = runningTvl * lastClose

            if (
                Number(row.total_value_locked) !== totalValueLocked ||
                Number(row.total_value_locked_usd) !== totalValueLockedUSD
            ) {
                pending.push([row.id, totalValueLocked, totalValueLockedUSD])
            }
        }

        scanned += rows.length

        while (pending.length >= BATCH_SIZE) {
            const batch = pending.slice(0, BATCH_SIZE)
            await writeLevels(db, table, ['total_value_locked', 'total_value_locked_usd'], batch)
            updated += batch.length
            pending = pending.slice(BATCH_SIZE)
        }

        const done = Math.min(i + TOKEN_CHUNK, tokens.length)
        if (done % (TOKEN_CHUNK * 40) === 0 || done === tokens.length) {
            console.log(`  ${done}/${tokens.length} tokens, ${scanned} buckets scanned, ${updated} updated`)
        }
    }

    await writeLevels(db, table, ['total_value_locked', 'total_value_locked_usd'], pending)
    updated += pending.length

    console.log(`  ${scanned} buckets scanned, ${updated} updated`)
    return updated
}

async function main(): Promise<void> {
    const db = createDataSource()
    await db.initialize()

    const started = Date.now()
    try {
        const uniswapDays = await finalizeUniswapDayData(db)
        const tokenDays = await finalizeTokenBuckets(db, 'token_day_data')
        const tokenHours = await finalizeTokenBuckets(db, 'token_hour_data')

        console.log(
            `\nfinalized in ${Math.round((Date.now() - started) / 1000)}s: ` +
                `${uniswapDays} uniswap_day_data, ${tokenDays} token_day_data, ${tokenHours} token_hour_data rows updated`
        )
        // pool_day_data and pool_hour_data are deliberately absent: a pool lives
        // in exactly one pass, so its accumulator is written by a single writer
        // in chain order and the levels those buckets sample are already exact.
    } finally {
        await db.destroy()
    }
}

main().then(
    () => process.exit(0),
    (err) => {
        console.error(err)
        process.exit(1)
    },
)
