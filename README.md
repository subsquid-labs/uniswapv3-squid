# Uniswap V3 squid

An indexer for [Uniswap V3](https://uniswap.org) on Ethereum mainnet, written with the
[Squid SDK](https://docs.sqd.dev/en/sdk). It reproduces the Uniswap V3 subgraph's entities — pools,
tokens, positions, ticks, swaps/mints/burns and the day/hour rollups — and serves them over GraphQL.

It doubles as the worked example for **indexing a factory contract with many children**. Uniswap V3
has ~72,000 pools on mainnet, which is far past the point where you can simply list them all in a
query, so this squid uses the two-phase scheme described below.

## The problem

A factory-based protocol gives you a set of child contracts that is not known when the indexer is
written. There are two ways to get their events:

1. **Ask for the children by address.** Cheap to process — the network sends only your data — but
   you have to know the addresses up front, and the address list has to fit in a query.
2. **Ask by event signature and filter in RAM.** Always correct, needs no address list, but the
   network sends every matching log on the chain, including every Uniswap fork's.

Portal caps a query at **256 KB**. For this squid's query — an address list plus the four pool event
topics and a field selection — that is about **5,500 addresses**, and `MAX_ADDRESSES_PER_PASS` leaves
headroom below it because going over is a hard `Query is too large`, not a slow query. Uniswap V3 has
an order of magnitude more pools than that, so neither option works alone.

## The two-phase scheme

Split the chain at a **cutoff block**:

- **Below the cutoff**, the pool set is known — it is whatever the factory had created by then — so
  the events are fetched by address. The addresses do not fit in one query, so this part is covered
  by several **passes**, each a separate processor run over the same block range with its own slice
  of the address list.
- **Above the cutoff**, the pool set is still growing, so events are fetched by signature and
  filtered against `PoolRegistry` in the batch handler.

`assets/pools.json` holds the cutoff and the per-pass address lists. Regenerate it with
`sqd get-pools`; re-run that whenever the wildcard span above the cutoff has grown large enough to
slow the sync down.

Passes are separate processes rather than several requests in one run because the SDK merges the
address filters of same-range requests into a single query, which would hit the 256 KB cap again.
Each phase keeps its progress in its own schema (`sqd_pass0`, `sqd_pass1`, …, `sqd_head`) and they
all write the same entity tables, so **they must be run in order, each to completion**. `sqd process`
does that for you.

### Choosing the cutoff

More pools below the cutoff means fewer wildcard blocks but more passes. `sqd get-pools` picks the
largest prefix of pool history that still fits in `MAX_PASSES` (default 5) passes. On mainnet:

| `MAX_PASSES` | Pools below cutoff | Cutoff block | Cutoff date |
| ------------ | ------------------ | ------------ | ----------- |
| 3            | ~10,200            | 16,532,444   | 2023-02-01  |
| 4            | ~15,200            | 17,960,619   | 2023-08-21  |
| 5            | ~20,200            | 19,210,472   | 2024-02-12  |

Roughly 5,000 pools per extra pass, and about 200 of the first pass's slots go to the pricing
backbone described next.

### Why the passes are not an arbitrary split

The passes run one after another, each replaying the same range, so a value that one pass writes and
another reads is read at the wrong time — the writer has already run ahead to the cutoff. Two things
in the Uniswap entity graph cross pool boundaries, and the pass assignment is built around them:

- **The ETH price.** Every USD figure derives from `Bundle.ethPriceUSD`, taken from the USDC/WETH
  0.3% pool. **Pass 0** therefore contains every pool whose two tokens are both whitelisted — about
  180 pools, the pricing backbone. See [The ETH price series](#the-eth-price-series) below.
- **Pricing a token needs its own pools.** Every swap recomputes `getEthPerToken` for both of its
  tokens, and for a non-whitelisted token that walks the pools pairing it with a whitelisted one,
  reading their **live** liquidity and prices. Those pool rows are only contemporaneous with the
  event inside their own pass, so all pools touching a token have to land in the same pass as that
  token's whitelist pools. A pool whose two tokens are both unpriced ties them together, which makes
  the unit of assignment a *connected component* of that graph rather than a single pool.
  `sqd get-pools` packs whole components into passes; the largest component is what limits how low
  the cutoff can go.

### The ETH price series

`Bundle.ethPriceUSD` is a single mutable scalar, and a scalar is only meaningful while it is written
and read in one chronological sweep. The passes are not one sweep: pass 0 runs ahead to the cutoff,
so by the time pass 1 replays 2021 that scalar holds a 2024 price. Membership does not fix this —
putting the pricing pool in pass 0 is necessary but not sufficient, because the problem is *when* the
value is read, not *where* it lives.

So pass 0 records the scalar's history. Every price-changing event on the pricing pool appends an
`EthPrice` row keyed by `(blockNumber, logIndex)`, and later passes binary-search that series for the
price in force at the exact log they are processing. Only the points covering the batch are loaded,
plus the one in force when the batch starts, so the cost is O(batch) no matter how long the history
gets. Below the current cutoff the series is about 500k rows.

`Token.derivedETH` is the same trap one level down: for a whitelisted token it is a stored column
holding whatever the last pass to touch it wrote. Since a whitelisted token's value is a pure
function of the ETH price, it is recomputed from the series rather than read (`derivedEthFor`).
Every other token is priced against pools that the grouping rule keeps inside its own pass, so its
stored value is already contemporaneous.

With those two, a multi-pass sync prices every event exactly as a single-pass sync would.

### Ordering the day and hour buckets

`TokenDayData`/`TokenHourData` are keyed by token, so a single bucket is written by every pass that
holds one of that token's pools. `open` and `close` mean "first and last event in the bucket", which
under naive last-write-wins would instead mean "whichever pass ran last".

Each bucket therefore stores `openOrder`/`closeOrder`, the position of the event that set it, as
`blockNumber * 1e6 + logIndex`, and only an earlier event may move `open` or a later one `close`.
That turns both into an argmin/argmax over the bucket, which is order-independent in the same way
`high` and `low` already were — replaying a pass cannot clobber a value another pass set from a
later event.

`logIndex` on EVM is block-scoped, counting every log in the block across all of its transactions,
so `(blockNumber, logIndex)` sequences a single chain on its own and no transaction index is needed.
`PoolDayData`/`PoolHourData` need none of this: a pool lives in exactly one pass, so its buckets are
already written in order.

### What is approximate

Everything keyed by pool is exact, because a pool lives in exactly one pass. So are the token
buckets' `open`, `close`, `high`, `low`, and the volume and fee sums. One thing is not:

The accumulators themselves are additive — `Factory.txCount` counts up, `Token.totalValueLocked`
takes signed deltas — so their **final** values are right once every pass has finished, and so are
the buckets' own `volume*`/`feesUSD`, which accumulate per bucket.

What is not additive is how a few buckets record a *level*: they assign the global accumulator
rather than summing their own contributions.

```ts
uniswapDayData.volumeUSD = uniswapDayData.volumeUSD + amountTotalUSDTracked  // counted, exact
uniswapDayData.txCount   = uniswapDayData.txCount + 1                        // counted, exact
uniswapDayData.tvlUSD    = uniswap.totalValueLockedUSD                       // sampled, partial
```

A sampled level is read while only some passes have contributed to the accumulator, so the bucket
records a number that is already incomplete when it is written — which is why position in the
bucket cannot repair it the way it repairs `open`/`close`.

`txCount` used to be sampled and is now counted per bucket. That was worth changing on its own
merits: the schema calls it "number of transactions during period", so sampling a cumulative
counter was the wrong quantity even in a single-pass sync, and counting is order-independent for
free.

What remains sampled is genuine levels, where counting is not an option because the field is a
stock rather than a flow:

- `UniswapDayData.tvlUSD`, which is global.
- `TokenDayData`/`TokenHourData` `totalValueLocked*`, but **only for the ~22 whitelisted tokens**.
  Every pool holding any other token lives in one pass, so that token's accumulator is complete and
  chronological when its buckets sample it.

`PoolDayData`/`PoolHourData` sample `tvlUSD` the same way and are exact, because a pool's
accumulator is written entirely by one pass, in order. Making the global and whitelisted-token
levels exact means accumulating their per-bucket *deltas* during indexing and turning those into
levels with a prefix sum once every pass has finished; this squid does not ship that step.

## PoolRegistry and forks

The wildcard phase needs the set of factory-created addresses in memory to tell Uniswap's logs from
every other protocol's. Caching that set across batches is what makes the phase affordable, but a
plain cache is wrong near the head: a pool created in a block that is later orphaned would stay in
the set forever and its events would keep being accepted, even though the store has rolled its rows
back.

`src/utils/poolRegistry.ts` splits the set at the reorg horizon instead of re-reading all of it:
everything up to the cutoff is seeded from the manifest for free, creations between the cutoff and
the horizon are read once and then cached, and only the shallow tail above the horizon — at most
`POOL_REGISTRY_REORG_DEPTH` blocks' worth — is re-read on every batch.

## Code layout

Within a batch the work is a topological sort over the entity graph rather than per-event handlers
behind a lazily-populated cache:

```
src/mappings/extract.ts          decode logs -> flat, chain-ordered event lists (touches no entities)
src/mappings/factory.ts          level 1: Tokens and Pools
src/mappings/core.ts             level 2: pool state, ticks, swap/mint/burn history, day+hour rollups
src/mappings/positionManager.ts  level 3: positions
src/main.ts                      loads each level in bulk, then persists parents before children
```

`src/utils/entities.ts` is the working set. `load()` is the only thing that reads the database and
`get()` is synchronous, so each level has to declare what it needs before it computes anything —
a miss is a bug in the level ordering rather than a cache miss to be hidden behind a query.

Contract state reads go through `src/utils/rpc.ts`, which owns its own RPC client: the Portal stream
does not carry one, and the fallback source may not be talking to an RPC endpoint at any moment.

## Data sources

`src/processor.ts` builds an `EvmFallbackDataSourceBuilder` over Portal with the RPC endpoint as a
standby, so an outage in either does not stop the sync. The field selection and the query are
declared once and applied to both, so the indexer's output does not depend on which is active.

## Running it

Dependencies: Node.js, Docker, an Ethereum RPC endpoint.

```bash
npm ci
cp .env.example .env      # set RPC_ETH_HTTP
sqd up                    # start Postgres
sqd get-pools             # build assets/pools.json (cutoff + passes)
sqd process               # run every pass in order, then follow the head
sqd serve                 # GraphQL API on localhost:4350/graphql
```

To run one phase at a time:

```bash
sqd process:phase pass0
sqd process:phase pass1
sqd process:phase head
```

Environment variables:

| Variable | Meaning |
| -------- | ------- |
| `RPC_ETH_HTTP` | Ethereum RPC endpoint. Required — used for contract state reads and as the fallback data source. |
| `PORTAL_URL` | Portal dataset. Defaults to the public mainnet dataset. |
| `PORTAL_API_KEY` | Only for a private or self-hosted portal; the public one needs no credentials. |
| `MAX_PASSES` | Pass budget for `sqd get-pools`. Default 5. |
| `DB_*` | Postgres connection, see `docker-compose.yml`. |
