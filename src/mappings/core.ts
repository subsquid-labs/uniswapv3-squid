import { BigDecimal } from "@subsquid/big-decimal";
import { EvmLog } from "@subsquid/evm-processor/lib/interfaces/evm";
import {
  BlockHandlerContext,
  LogHandlerContext,
  BlockHeader,
} from "../utils/interfaces/interfaces";
import { DataHandlerContext, assertNotNull } from "@subsquid/evm-processor";

import { Store } from "@subsquid/typeorm-store";
import { Multicall } from "../abi/multicall";
import * as poolAbi from "../abi/pool";
import {
  Bundle,
  Burn,
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
} from "../model";
import { safeDiv } from "../utils";
import { BlockMap } from "../utils/blockMap";
import {
  FACTORY_ADDRESS,
  MULTICALL_ADDRESS,
  MULTICALL_PAGE_SIZE,
} from "../utils/constants";
import { EntityManager } from "../utils/entityManager";
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
} from "../utils/intervalUpdates";
import {
  getTrackedAmountUSD,
  MINIMUM_ETH_LOCKED,
  sqrtPriceX96ToTokenPrices,
  STABLE_COINS,
  USDC_WETH_03_POOL,
  WETH_ADDRESS,
  WHITELIST_TOKENS
} from "../utils/pricing";
import { createTick, feeTierToTickSpacing } from "../utils/tick";
import { last, processItem } from "../utils/tools";
import {
  BlockData,
  //Transaction,
} from "@subsquid/evm-processor/src/interfaces/data";
import { Transaction } from "../processor";
type EventData =
  | (InitializeData & { type: "Initialize" })
  | (MintData & { type: "Mint" })
  | (BurnData & { type: "Burn" })
  | (SwapData & { type: "Swap" });

type ContextWithEntityManager = DataHandlerContext<Store> & {
  entities: EntityManager;
};

export async function processPairs(
  ctx: ContextWithEntityManager,
  blocks: BlockData[]
): Promise<void> {
  //console.log("processPairs");

  let eventsData = await processItems(ctx, blocks);
  //console.log("processPairs", eventsData);
  if (!eventsData || eventsData.size == 0) return;

  await prefetch(ctx, eventsData);

  let bundle = await ctx.store.findOne(Bundle, { where: { id: "1" } });
  let factory = await ctx.store.findOne(Factory, {
    where: { id: FACTORY_ADDRESS },
  });

  for (let [block, blockEventsData] of eventsData) {
    for (let data of blockEventsData) {
      switch (data.type) {
        case "Initialize":
          await processInitializeData(ctx, block, data);
          break;
        case "Mint":
          await processMintData(ctx, block, data);
          break;
        case "Burn":
          await processBurnData(ctx, block, data);
          break;
        case "Swap":
          await processSwapData(ctx, block, data);
          break;
      }
    }
  }

  await Promise.all([
    updatePoolFeeVars(
      { ...ctx, block: last(blocks).header },
      ctx.entities.values(Pool)
    ),
    updateTickFeeVars(
      { ...ctx, block: last(blocks).header },
      ctx.entities.values(Tick)
    ),
  ]);
}

async function prefetch(
  ctx: ContextWithEntityManager,
  eventsData: BlockMap<EventData>
) {
  let dayIds = new Set<number>();
  let hoursIds = new Set<number>();

  for (let [block, blockEventsData] of eventsData) {
    for (let data of blockEventsData) {
      switch (data.type) {
        case "Initialize":
          ctx.entities.defer(Tick, tickId(data.poolId, data.tick));
          ctx.entities.defer(Pool, data.poolId);
          break;
        case "Mint":
          ctx.entities.defer(Pool, data.poolId);
          ctx.entities.defer(
            Tick,
            tickId(data.poolId, data.tickLower),
            tickId(data.poolId, data.tickUpper)
          );
          break;
        case "Burn":
          ctx.entities.defer(Pool, data.poolId);
          ctx.entities.defer(
            Tick,
            tickId(data.poolId, data.tickLower),
            tickId(data.poolId, data.tickUpper)
          );
          break;
        case "Swap":
          ctx.entities.defer(Tick, tickId(data.poolId, data.tick));
          ctx.entities.defer(Pool, data.poolId);
          break;
      }
    }
    dayIds.add(getDayIndex(block.timestamp));
    hoursIds.add(getHourIndex(block.timestamp));
  }

  let pools = await ctx.entities.load(Pool);

  let poolsTicksIds = collectTicksFromPools(pools.values());
  let ticks = await ctx.entities.defer(Tick, ...poolsTicksIds).load(Tick);

  let tokenIds = collectTokensFromPools(pools.values());
  let tokens = await ctx.entities.defer(Token, ...tokenIds).load(Token);

  let whiteListPoolsIds = collectWhiteListPoolsFromTokens(tokens.values());
  pools = await ctx.entities.defer(Pool, ...whiteListPoolsIds).load(Pool);

  let whiteListPoolsTokenIds = collectTokensFromPools(pools.values());
  tokens = await ctx.entities
    .defer(Token, ...whiteListPoolsTokenIds)
    .load(Token);

  for (let index of dayIds) {
    ctx.entities.defer(UniswapDayData, snapshotId(FACTORY_ADDRESS, index));

    for (let id of pools.keys()) {
      ctx.entities.defer(PoolDayData, snapshotId(id, index));
    }

    for (let id of tokens.keys()) {
      ctx.entities.defer(TokenDayData, snapshotId(id, index));
    }

    for (let id of ticks.keys()) {
      ctx.entities.defer(TickDayData, snapshotId(id, index));
    }
  }

  for (let index of hoursIds) {
    for (let id of pools.keys()) {
      ctx.entities.defer(PoolHourData, snapshotId(id, index));
    }

    for (let id of tokens.keys()) {
      ctx.entities.defer(TokenHourData, snapshotId(id, index));
    }
  }

  await ctx.entities.load(Pool);
  await ctx.entities.load(Token);
  await ctx.entities.load(Tick);
  await ctx.entities.load(UniswapDayData);
  await ctx.entities.load(PoolDayData);
  await ctx.entities.load(TokenDayData);
  await ctx.entities.load(TickDayData);
  await ctx.entities.load(PoolHourData);
  await ctx.entities.load(TokenHourData);
}

async function processItems(
  ctx: ContextWithEntityManager,
  blocks: BlockData[]
) {
  let eventsData = new BlockMap<EventData>();

  for (let block of blocks) {
    for (let log of block.logs) {
      let evmLog = {
        logIndex: log.logIndex,
        transactionIndex: log.transactionIndex,
        transactionHash: log.transaction?.hash || "",
        address: log.address,
        data: log.data,
        topics: log.topics,
      };
      let pool = await ctx.entities.get(Pool, log.address);
      if (pool) {
        //console.log("evmLog", log.topics[0]);
        switch (log.topics[0]) {
          case poolAbi.events.Initialize.topic: {
            let data = processInitialize(evmLog);
            eventsData.push(block.header, {
              type: "Initialize",
              ...data,
            });
            break;
          }
          case poolAbi.events.Mint.topic: {
            if (log.transaction != undefined) {
              let data = processMint(evmLog, log.transaction);
              eventsData.push(block.header, {
                type: "Mint",
                ...data,
              });
            }
            break;
          }
          case poolAbi.events.Burn.topic: {
            //console.log("Burn");
            //console.log("log.transaction", log.topics[0]);
            let data = processBurn(evmLog, log.transaction);
            eventsData.push(block.header, {
              type: "Burn",
              ...data,
            });
            break;
          }
          case poolAbi.events.Swap.topic: {
            let data = processSwap(evmLog, log.transaction);
            eventsData.push(block.header, {
              type: "Swap",
              ...data,
            });
            break;
          }
        }
      }
    }
  }
  //.log("eventsData", eventsData);
  return eventsData;
}

async function processInitializeData(
  ctx: ContextWithEntityManager,
  block: BlockHeader,
  data: InitializeData
) {
  let bundle = await ctx.entities.getOrFail(Bundle, "1");

  let pool = ctx.entities.get(Pool, data.poolId, false);
  if (pool == null) return;

  let token0 = await ctx.entities.getOrFail(Token, pool.token0Id);
  let token1 = await ctx.entities.getOrFail(Token, pool.token1Id);

  // update pool sqrt price and tick
  pool.sqrtPrice = data.sqrtPrice;
  pool.tick = data.tick;

  // Calculate and update token prices from sqrtPrice
  let prices = sqrtPriceX96ToTokenPrices(
    data.sqrtPrice,
    token0.decimals,
    token1.decimals,
    data.poolId,
    token0.symbol,
    token1.symbol,
    new Date(block.timestamp).toISOString()
  );
  pool.token0Price = prices[0];
  pool.token1Price = prices[1];

  // update token prices
  token0.derivedETH = await getEthPerToken(ctx, token0.id);
  token1.derivedETH = await getEthPerToken(ctx, token1.id);

  let usdcPool = await ctx.entities.get(Pool, USDC_WETH_03_POOL);
  bundle.ethPriceUSD = usdcPool?.token0Price || 0;

  await updatePoolDayData(ctx, block, pool.id);
  await updatePoolHourData(ctx, block, pool.id);
  await updateTokenDayData(ctx, block, token0.id);
  await updateTokenHourData(ctx, block, token0.id);
  await updateTokenDayData(ctx, block, token1.id);
  await updateTokenHourData(ctx, block, token1.id);
}

async function processMintData(
  ctx: ContextWithEntityManager,
  block: BlockHeader,
  data: MintData
) {
  let bundle = await ctx.entities.getOrFail(Bundle, "1");
  let factory = await ctx.entities.getOrFail(Factory, FACTORY_ADDRESS);

  let pool = ctx.entities.get(Pool, data.poolId, false);
  if (pool == null) return;

  let token0 = await ctx.entities.getOrFail(Token, pool.token0Id);
  let token1 = await ctx.entities.getOrFail(Token, pool.token1Id);

  let amount0 = BigDecimal(data.amount0, token0.decimals).toNumber();
  let amount1 = BigDecimal(data.amount1, token1.decimals).toNumber();

  let amountUSD =
    amount0 * (token0.derivedETH * bundle.ethPriceUSD) +
    amount1 * (token1.derivedETH * bundle.ethPriceUSD);

  // reset tvl aggregates until new amounts calculated
  factory.totalValueLockedETH =
    factory.totalValueLockedETH - pool.totalValueLockedETH;

  // update globals
  factory.txCount++;

  // update token0 data
  token0.txCount++;
  token0.totalValueLocked = token0.totalValueLocked + amount0;
  token0.totalValueLockedUSD =
    token0.totalValueLocked * (token0.derivedETH * bundle.ethPriceUSD);

  // update token1 data
  token1.txCount++;
  token1.totalValueLocked = token1.totalValueLocked + amount1;
  token1.totalValueLockedUSD =
    token1.totalValueLocked * (token1.derivedETH * bundle.ethPriceUSD);

  // pool data
  pool.txCount++;

  // Pools liquidity tracks the currently active liquidity given pools current tick.
  // We only want to update it on mint if the new position includes the current tick.
  if (
    pool.tick != null &&
    data.tickLower <= pool.tick &&
    data.tickUpper > pool.tick
  ) {
    pool.liquidity += data.amount;
  }

  pool.totalValueLockedToken0 = pool.totalValueLockedToken0 + amount0;
  pool.totalValueLockedToken1 = pool.totalValueLockedToken1 + amount1;
  pool.totalValueLockedETH =
    pool.totalValueLockedToken0 * token0.derivedETH +
    pool.totalValueLockedToken1 * token1.derivedETH;
  pool.totalValueLockedUSD = pool.totalValueLockedETH * bundle.ethPriceUSD;

  // reset aggregates with new amounts
  factory.totalValueLockedETH =
    factory.totalValueLockedETH + pool.totalValueLockedETH;
  factory.totalValueLockedUSD =
    factory.totalValueLockedETH * bundle.ethPriceUSD;

  token0.totalValueLocked = token0.totalValueLocked + amount0;
  token0.totalValueLockedUSD = token0.totalValueLocked * token0.derivedETH * bundle.ethPriceUSD;

  token1.totalValueLocked = token1.totalValueLocked + amount1;
  token1.totalValueLockedUSD = token1.totalValueLocked * token1.derivedETH * bundle.ethPriceUSD;

  let transaction = ctx.entities.get(Tx, data.transaction.hash, false);
  if (!transaction) {
    transaction = createTransaction(block, data.transaction);
    ctx.entities.add(transaction);
  }

  ctx.entities.add(
    new Mint({
      id: `${pool.id}#${pool.txCount}`,
      transactionId: transaction.id,
      timestamp: transaction.timestamp,
      poolId: pool.id,
      token0Id: pool.token0Id,
      token1Id: pool.token1Id,
      owner: data.owner,
      sender: data.sender,
      origin: data.transaction.from,
      amount: data.amount,
      amount0,
      amount1,
      amountUSD,
      tickLower: data.tickLower,
      tickUpper: data.tickUpper,
      logIndex: data.logIndex,
    })
  );

  // tick ctx.entities
  let lowerTickId = tickId(pool.id, data.tickLower);
  let lowerTick = ctx.entities.get(Tick, lowerTickId, false);
  if (lowerTick == null) {
    lowerTick = createTick(lowerTickId, data.tickLower, pool.id);
    lowerTick.createdAtBlockNumber = block.height;
    lowerTick.createdAtTimestamp = new Date(block.timestamp);
    ctx.entities.add(lowerTick);
  }

  let upperTickId = tickId(pool.id, data.tickUpper);
  let upperTick = ctx.entities.get(Tick, upperTickId, false);
  if (upperTick == null) {
    upperTick = createTick(upperTickId, data.tickUpper, pool.id);
    upperTick.createdAtBlockNumber = block.height;
    upperTick.createdAtTimestamp = new Date(block.timestamp);
    ctx.entities.add(upperTick);
  }

  lowerTick.liquidityGross += data.amount;
  lowerTick.liquidityNet += data.amount;

  upperTick.liquidityGross += data.amount;
  upperTick.liquidityNet -= data.amount;

  // Update volume metrics
  let uniswapDayData = await updateUniswapDayData(ctx, block);
  let poolDayData = await updatePoolDayData(ctx, block, pool.id);
  let poolHourData = await updatePoolHourData(ctx, block, pool.id);
  let token0DayData = await updateTokenDayData(ctx, block, token0.id);
  let token0HourData = await updateTokenHourData(ctx, block, token0.id);
  let token1DayData = await updateTokenDayData(ctx, block, token1.id);
  let token1HourData = await updateTokenHourData(ctx, block, token1.id);

  if (poolDayData && poolHourData) {
    poolDayData.volumeUSD = poolDayData.volumeUSD + amountUSD;
    poolDayData.volumeToken0 = poolDayData.volumeToken0 + amount0;
    poolDayData.volumeToken1 = poolDayData.volumeToken1 + amount1;

    poolHourData.volumeUSD = poolHourData.volumeUSD + amountUSD;
    poolHourData.volumeToken0 = poolHourData.volumeToken0 + amount0;
    poolHourData.volumeToken1 = poolHourData.volumeToken1 + amount1;
  }

  token0DayData.volume = token0DayData.volume + amount0;
  token0DayData.volumeUSD = token0DayData.volumeUSD + amountUSD;

  token0HourData.volume = token0HourData.volume + amount0;
  token0HourData.volumeUSD = token0HourData.volumeUSD + amountUSD;

  token1DayData.volume = token1DayData.volume + amount1;
  token1DayData.volumeUSD = token1DayData.volumeUSD + amountUSD;

  token1HourData.volume = token1HourData.volume + amount1;
  token1HourData.volumeUSD = token1HourData.volumeUSD + amountUSD;
}

async function processBurnData(
  ctx: ContextWithEntityManager,
  block: BlockHeader,
  data: BurnData
) {
  let bundle = await ctx.entities.getOrFail(Bundle, "1");
  let factory = await ctx.entities.getOrFail(Factory, FACTORY_ADDRESS);

  let pool = ctx.entities.get(Pool, data.poolId, false);
  if (pool == null) return;

  let token0 = await ctx.entities.getOrFail(Token, pool.token0Id);
  let token1 = await ctx.entities.getOrFail(Token, pool.token1Id);

  let amount0 = BigDecimal(data.amount0, token0.decimals).toNumber();
  let amount1 = BigDecimal(data.amount1, token1.decimals).toNumber();

  let amountUSD =
    amount0 * (token0.derivedETH * bundle.ethPriceUSD) +
    amount1 * (token1.derivedETH * bundle.ethPriceUSD);

  // reset tvl aggregates until new amounts calculated
  factory.totalValueLockedETH =
    factory.totalValueLockedETH - pool.totalValueLockedETH;

  // update globals
  factory.txCount++;

  // update token0 data
  token0.txCount++;
  token0.totalValueLocked = token0.totalValueLocked - amount0;
  token0.totalValueLockedUSD =
    token0.totalValueLocked * (token0.derivedETH * bundle.ethPriceUSD);

  // update token1 data
  token1.txCount++;
  token1.totalValueLocked = token1.totalValueLocked - amount1;
  token1.totalValueLockedUSD =
    token1.totalValueLocked * (token1.derivedETH * bundle.ethPriceUSD);

  // pool data
  pool.txCount++;
  // Pools liquidity tracks the currently active liquidity given pools current tick.
  // We only want to update it on burn if the position being burnt includes the current tick.
  if (
    pool.tick != null &&
    data.tickLower <= pool.tick &&
    data.tickUpper > pool.tick
  ) {
    pool.liquidity -= data.amount;
  }

  pool.totalValueLockedToken0 = pool.totalValueLockedToken0 - amount0;
  pool.totalValueLockedToken1 = pool.totalValueLockedToken1 - amount1;

  // Update TVL in ETH and USD
  pool.totalValueLockedETH =
    pool.totalValueLockedToken0 * token0.derivedETH +
    pool.totalValueLockedToken1 * token1.derivedETH;
  pool.totalValueLockedUSD = pool.totalValueLockedETH * bundle.ethPriceUSD;

  // Update factory TVL
  factory.totalValueLockedETH =
    factory.totalValueLockedETH + pool.totalValueLockedETH;
  factory.totalValueLockedUSD =
    factory.totalValueLockedETH * bundle.ethPriceUSD;

  // Update token TVL
  token0.totalValueLocked = token0.totalValueLocked - amount0;
  token0.totalValueLockedUSD = token0.totalValueLocked * token0.derivedETH * bundle.ethPriceUSD;

  token1.totalValueLocked = token1.totalValueLocked - amount1;
  token1.totalValueLockedUSD = token1.totalValueLocked * token1.derivedETH * bundle.ethPriceUSD;

  // burn entity
  let transaction = ctx.entities.get(Tx, data.transaction.hash, false);
  if (!transaction) {
    transaction = createTransaction(block, data.transaction);
    ctx.entities.add(transaction);
  }

  ctx.entities.add(
    new Burn({
      id: `${pool.id}#${pool.txCount}`,
      transactionId: transaction.id,
      timestamp: new Date(block.timestamp),
      poolId: pool.id,
      token0Id: pool.token0Id,
      token1Id: pool.token1Id,
      owner: data.owner,
      origin: data.transaction.from,
      amount: data.amount,
      amount0,
      amount1,
      amountUSD,
      tickLower: data.tickLower,
      tickUpper: data.tickUpper,
      logIndex: data.logIndex,
    })
  );

  // tick ctx.entities
  let lowerTickId = tickId(pool.id, data.tickLower);
  let lowerTick = await ctx.entities.get(Tick, lowerTickId);

  let upperTickId = tickId(pool.id, data.tickUpper);
  let upperTick = await ctx.entities.get(Tick, upperTickId);

  if (lowerTick) {
    lowerTick.liquidityGross -= data.amount;
    lowerTick.liquidityNet -= data.amount;
  }

  if (upperTick) {
    upperTick.liquidityGross -= data.amount;
    upperTick.liquidityNet += data.amount;
  }

  // Update volume metrics
  let uniswapDayData = await updateUniswapDayData(ctx, block);
  let poolDayData = await updatePoolDayData(ctx, block, pool.id);
  let poolHourData = await updatePoolHourData(ctx, block, pool.id);
  let token0DayData = await updateTokenDayData(ctx, block, token0.id);
  let token0HourData = await updateTokenHourData(ctx, block, token0.id);
  let token1DayData = await updateTokenDayData(ctx, block, token1.id);
  let token1HourData = await updateTokenHourData(ctx, block, token1.id);

  if (poolDayData && poolHourData) {
    poolDayData.volumeUSD = poolDayData.volumeUSD + amountUSD;
    poolDayData.volumeToken0 = poolDayData.volumeToken0 + amount0;
    poolDayData.volumeToken1 = poolDayData.volumeToken1 + amount1;

    poolHourData.volumeUSD = poolHourData.volumeUSD + amountUSD;
    poolHourData.volumeToken0 = poolHourData.volumeToken0 + amount0;
    poolHourData.volumeToken1 = poolHourData.volumeToken1 + amount1;
  }

  token0DayData.volume = token0DayData.volume + amount0;
  token0DayData.volumeUSD = token0DayData.volumeUSD + amountUSD;

  token0HourData.volume = token0HourData.volume + amount0;
  token0HourData.volumeUSD = token0HourData.volumeUSD + amountUSD;

  token1DayData.volume = token1DayData.volume + amount1;
  token1DayData.volumeUSD = token1DayData.volumeUSD + amountUSD;

  token1HourData.volume = token1HourData.volume + amount1;
  token1HourData.volumeUSD = token1HourData.volumeUSD + amountUSD;
}

async function processSwapData(
  ctx: ContextWithEntityManager,
  block: BlockHeader,
  data: SwapData
): Promise<void> {
  if (data.poolId == "0x9663f2ca0454accad3e094448ea6f77443880454") return;

  let bundle = await ctx.entities.getOrFail(Bundle, "1");
  let factory = await ctx.entities.getOrFail(Factory, FACTORY_ADDRESS);

  let pool = ctx.entities.get(Pool, data.poolId, false);
  if (pool == null) return;

  let token0 = await ctx.entities.getOrFail(Token, pool.token0Id);
  let token1 = await ctx.entities.getOrFail(Token, pool.token1Id);


  let amount0 = BigDecimal(data.amount0, token0.decimals).toNumber();
  let amount1 = BigDecimal(data.amount1, token1.decimals).toNumber();

  let oldTick = pool.tick || 0;

  // need absolute amounts for volume
  let amount0Abs = Math.abs(amount0);
  let amount1Abs = Math.abs(amount1);

  let amount0ETH = amount0Abs * token0.derivedETH;
  let amount1ETH = amount1Abs * token1.derivedETH;
  let amount0USD = amount0ETH * bundle.ethPriceUSD;
  let amount1USD = amount1ETH * bundle.ethPriceUSD;

  // get amount that should be tracked only - div 2 because cant count both input and output as volume
  let amountTotalUSDTracked = getTrackedAmountUSD(
    token0.id,
    amount0USD,
    token1.id,
    amount1USD
  );

  let amountTotalETHTracked = safeDiv(
    amountTotalUSDTracked,
    bundle.ethPriceUSD
  );
  let amountTotalUSDUntracked = (amount0USD + amount1USD) / 2;

  let feesETH =
    (Number(amountTotalETHTracked) * Number(pool.feeTier)) / 1000000;
  let feesUSD =
    (Number(amountTotalUSDTracked) * Number(pool.feeTier)) / 1000000;

  // global updates
  factory.txCount++;
  factory.totalVolumeETH = factory.totalVolumeETH + amountTotalETHTracked;
  factory.totalVolumeUSD = factory.totalVolumeUSD + amountTotalUSDTracked;
  factory.untrackedVolumeUSD =
    factory.untrackedVolumeUSD + amountTotalUSDUntracked;
  factory.totalFeesETH = factory.totalFeesETH + feesETH;
  factory.totalFeesUSD = factory.totalFeesUSD + feesUSD;

  // reset aggregate tvl before individual pool tvl updates
  let currentPoolTvlETH = pool.totalValueLockedETH;
  factory.totalValueLockedETH = factory.totalValueLockedETH - currentPoolTvlETH;

  // pool volume
  pool.txCount++;
  pool.volumeToken0 = pool.volumeToken0 + amount0Abs;
  pool.volumeToken1 = pool.volumeToken1 + amount1Abs;
  pool.volumeUSD = pool.volumeUSD + amountTotalUSDTracked;
  pool.untrackedVolumeUSD = pool.untrackedVolumeUSD + amountTotalUSDUntracked;
  pool.feesUSD = pool.feesUSD + feesUSD;

  // Update the pool with the new active liquidity, price, and tick.
  pool.liquidity = data.liquidity;
  pool.tick = data.tick;
  pool.sqrtPrice = data.sqrtPrice;
  pool.totalValueLockedToken0 = pool.totalValueLockedToken0 + amount0;
  pool.totalValueLockedToken1 = pool.totalValueLockedToken1 + amount1;

  // update token0 data
  token0.txCount++;
  token0.volume = token0.volume + amount0Abs;
  token0.totalValueLocked = token0.totalValueLocked + amount0;
  token0.volumeUSD = token0.volumeUSD + amountTotalUSDTracked;
  token0.untrackedVolumeUSD =
    token0.untrackedVolumeUSD + amountTotalUSDUntracked;
  token0.feesUSD = token0.feesUSD + feesUSD;

  // update token1 data
  token1.txCount++;
  token1.volume = token1.volume + amount1Abs;
  token1.totalValueLocked = token1.totalValueLocked + amount1;
  token1.volumeUSD = token1.volumeUSD + amountTotalUSDTracked;
  token1.untrackedVolumeUSD =
    token1.untrackedVolumeUSD + amountTotalUSDUntracked;
  token1.feesUSD = token1.feesUSD + feesUSD;

  // updated pool ratess
  let prices = sqrtPriceX96ToTokenPrices(
    pool.sqrtPrice,
    token0.decimals,
    token1.decimals,
    pool.id,
    token0.symbol,
    token1.symbol,
    new Date(block.timestamp).toISOString()
  );
  pool.token0Price = prices[0];
  pool.token1Price = prices[1];

  // update USD pricing
  token0.derivedETH = await getEthPerToken(ctx, token0.id);
  token1.derivedETH = await getEthPerToken(ctx, token1.id);

  let usdcPool = await ctx.entities.get(Pool, USDC_WETH_03_POOL);
  bundle.ethPriceUSD = usdcPool?.token0Price || 0;

  // Things afffected by new USD rates
  pool.totalValueLockedETH =
    pool.totalValueLockedToken0 * token0.derivedETH +
    pool.totalValueLockedToken1 * token1.derivedETH;
  pool.totalValueLockedUSD = pool.totalValueLockedETH * bundle.ethPriceUSD;

  // Update factory TVL
  factory.totalValueLockedETH =
    factory.totalValueLockedETH + pool.totalValueLockedETH;
  factory.totalValueLockedUSD =
    factory.totalValueLockedETH * bundle.ethPriceUSD;

  token0.totalValueLockedUSD =
    token0.totalValueLocked * token0.derivedETH * bundle.ethPriceUSD;
  token1.totalValueLockedUSD =
    token1.totalValueLocked * token1.derivedETH * bundle.ethPriceUSD;



  // // interval data
  let uniswapDayData = await updateUniswapDayData(ctx, block);
  let poolDayData = await updatePoolDayData(ctx, block, pool.id);
  let poolHourData = await updatePoolHourData(ctx, block, pool.id);
  let token0DayData = await updateTokenDayData(ctx, block, token0.id);
  let token0HourData = await updateTokenHourData(ctx, block, token0.id);
  let token1DayData = await updateTokenDayData(ctx, block, token1.id);
  let token1HourData = await updateTokenHourData(ctx, block, token1.id);

  uniswapDayData.volumeETH = uniswapDayData.volumeETH + amountTotalETHTracked;
  uniswapDayData.volumeUSD = uniswapDayData.volumeUSD + amountTotalUSDTracked;
  uniswapDayData.feesUSD = uniswapDayData.feesUSD + feesUSD;
  // Update volume metrics
  if (poolDayData && poolHourData) {
    poolDayData.volumeUSD = poolDayData.volumeUSD + amountTotalUSDTracked;
    poolDayData.volumeToken0 = poolDayData.volumeToken0 + amount0Abs;
    poolDayData.volumeToken1 = poolDayData.volumeToken1 + amount1Abs;
    poolDayData.feesUSD = poolDayData.feesUSD + feesUSD;

    poolHourData.volumeUSD = poolHourData.volumeUSD + amountTotalUSDTracked;
    poolHourData.volumeToken0 = poolHourData.volumeToken0 + amount0Abs;
    poolHourData.volumeToken1 = poolHourData.volumeToken1 + amount1Abs;
    poolHourData.feesUSD = poolHourData.feesUSD + feesUSD;
  }

  token0DayData.volume = token0DayData.volume + amount0Abs;
  token0DayData.volumeUSD = token0DayData.volumeUSD + amountTotalUSDTracked;
  token0DayData.untrackedVolumeUSD =
    token0DayData.untrackedVolumeUSD + amountTotalUSDUntracked;
  token0DayData.feesUSD = token0DayData.feesUSD + feesUSD;

  token0HourData.volume = token0HourData.volume + amount0Abs;
  token0HourData.volumeUSD = token0HourData.volumeUSD + amountTotalUSDTracked;
  token0HourData.untrackedVolumeUSD =
    token0HourData.untrackedVolumeUSD + amountTotalUSDUntracked;
  token0HourData.feesUSD = token0HourData.feesUSD + feesUSD;

  token1DayData.volume = token1DayData.volume + amount1Abs;
  token1DayData.volumeUSD = token1DayData.volumeUSD + amountTotalUSDTracked;
  token1DayData.untrackedVolumeUSD =
    token1DayData.untrackedVolumeUSD + amountTotalUSDUntracked;
  token1DayData.feesUSD = token1DayData.feesUSD + feesUSD;

  token1HourData.volume = token1HourData.volume + amount1Abs;
  token1HourData.volumeUSD = token1HourData.volumeUSD + amountTotalUSDTracked;
  token1HourData.untrackedVolumeUSD =
    token1HourData.untrackedVolumeUSD + amountTotalUSDUntracked;
  token1HourData.feesUSD = token1HourData.feesUSD + feesUSD;

  // Update inner vars of current or crossed ticks
  let newTick = pool.tick;
  let tickSpacing = feeTierToTickSpacing(pool.feeTier);
  let modulo = Math.floor(Number(newTick) / Number(tickSpacing));
  if (modulo == 0) {
    let tick = createTick(tickId(pool.id, newTick), newTick, pool.id);
    tick.createdAtBlockNumber = block.height;
    tick.createdAtTimestamp = new Date(block.timestamp);
    ctx.entities.add(tick);
  }

  // create Swap event
  let transaction = ctx.entities.get(Tx, data.transaction.hash, false);
  if (!transaction) {
    transaction = createTransaction(block, data.transaction);
    ctx.entities.add(transaction);
  }

  let swap = new Swap({ id: pool.id + "#" + pool.txCount.toString() });
  swap.transactionId = transaction.id;
  swap.timestamp = transaction.timestamp;
  swap.poolId = pool.id;
  swap.token0Id = pool.token0Id;
  swap.token1Id = pool.token1Id;
  swap.sender = data.sender;
  swap.origin = data.transaction.from;
  swap.recipient = data.recipient;
  swap.amount0 = amount0;
  swap.amount1 = amount1;
  swap.amountUSD = amountTotalUSDTracked;
  swap.tick = data.tick;
  swap.sqrtPriceX96 = data.sqrtPrice;
  swap.logIndex = data.logIndex;
  ctx.entities.add(swap);

}

async function getEthPerToken(
  ctx: ContextWithEntityManager,
  tokenId: string
): Promise<number> {
  let bundle = await ctx.entities.getOrFail(Bundle, "1");
  let token = await ctx.entities.getOrFail(Token, tokenId);

  // Return 1 for WETH
  if (tokenId.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
    return 1;
  }

  // for now just take USD from pool with greatest TVL
  // need to update this to actually detect best rate based on liquidity distribution
  let largestLiquidityETH = MINIMUM_ETH_LOCKED;
  let priceSoFar = 0;
  let selectedPoolAddress = '';

  // Use WHITELIST_TOKENS instead of STABLE_COINS for consistency
  if (WHITELIST_TOKENS.includes(tokenId.toLowerCase())) {
    priceSoFar = safeDiv(1, bundle.ethPriceUSD);
  } else {
    for (let poolAddress of token.whitelistPools) {
      let pool = await ctx.entities.getOrFail(Pool, poolAddress);
      if (pool.liquidity === 0n) continue;

      if (pool.token0Id.toLowerCase() === tokenId.toLowerCase()) {
        // whitelist token is token1
        let token1 = await ctx.entities.getOrFail(Token, pool.token1Id);
        // Skip if token1's price is not derived yet
        if (token1.derivedETH === 0) continue;
        
        // get the derived ETH in pool
        let ethLocked = pool.totalValueLockedToken1 * token1.derivedETH;
        if (ethLocked > largestLiquidityETH && ethLocked >= MINIMUM_ETH_LOCKED) {
          largestLiquidityETH = ethLocked;
          // token1 per our token * Eth per token1
          priceSoFar = pool.token1Price * token1.derivedETH;
          selectedPoolAddress = poolAddress;
        }
      }
      if (pool.token1Id.toLowerCase() === tokenId.toLowerCase()) {
        // whitelist token is token0
        let token0 = await ctx.entities.getOrFail(Token, pool.token0Id);
        // Skip if token0's price is not derived yet
        if (token0.derivedETH === 0) continue;
        
        // get the derived ETH in pool
        let ethLocked = pool.totalValueLockedToken0 * token0.derivedETH;
        if (ethLocked > largestLiquidityETH && ethLocked >= MINIMUM_ETH_LOCKED) {
          largestLiquidityETH = ethLocked;
          // token0 per our token * ETH per token0
          priceSoFar = pool.token0Price * token0.derivedETH;
          selectedPoolAddress = poolAddress;
        }
      }
    }
  }
  return priceSoFar;
}

async function updateUniswapDayData(
  ctx: ContextWithEntityManager,
  block: BlockHeader
): Promise<UniswapDayData> {
  let uniswap = await ctx.entities.getOrFail(Factory, FACTORY_ADDRESS);

  let dayID = getDayIndex(block.timestamp);
  let id = snapshotId(FACTORY_ADDRESS, dayID);

  let uniswapDayData = ctx.entities.get(UniswapDayData, id, false);
  if (uniswapDayData == null) {
    uniswapDayData = createUniswapDayData(FACTORY_ADDRESS, dayID);
    ctx.entities.add(uniswapDayData);
  }
  uniswapDayData.tvlUSD = uniswap.totalValueLockedUSD;
  uniswapDayData.txCount = uniswap.txCount;

  return uniswapDayData;
}

async function updatePoolDayData(
  ctx: ContextWithEntityManager,
  block: BlockHeader,
  poolId: string
): Promise<PoolDayData | null> {
  let pool = await ctx.entities.getOrFail(Pool, poolId);
  let bundle = await ctx.entities.getOrFail(Bundle, "1");

  // Skip creating records if there's no valid price data
  if (pool.sqrtPrice === 0n) {
    return null;
  }

  let token0 = await ctx.entities.getOrFail(Token, pool.token0Id);
  let token1 = await ctx.entities.getOrFail(Token, pool.token1Id);
  let prices = sqrtPriceX96ToTokenPrices(
    pool.sqrtPrice,
    token0.decimals,
    token1.decimals,
    pool.id,
    token0.symbol,
    token1.symbol,
    new Date(block.timestamp).toISOString()
  );

  // Skip if we don't have valid prices
  if (prices[0] === 0 || prices[1] === 0) {
    return null;
  }

  let dayID = getDayIndex(block.timestamp);
  let dayPoolID = snapshotId(poolId, dayID);

  let poolDayData = ctx.entities.get(PoolDayData, dayPoolID, false);
  let isNewEntity = !poolDayData;
  
  if (!poolDayData) {
    poolDayData = createPoolDayData(poolId, dayID);
    ctx.entities.add(poolDayData);
  }

  // Update prices
  if (isNewEntity || poolDayData.open === 0) {
    poolDayData.open = prices[0];
  }
  if (isNewEntity || poolDayData.high === 0 || prices[0] > poolDayData.high) {
    poolDayData.high = prices[0];
  }
  if (isNewEntity || poolDayData.low === 0 || prices[0] < poolDayData.low) {
    poolDayData.low = prices[0];
  }
  poolDayData.close = prices[0];
  poolDayData.token0Price = prices[0];
  poolDayData.token1Price = prices[1];

  // Update TVL
  poolDayData.tvlUSD = pool.totalValueLockedUSD;
  poolDayData.liquidity = pool.liquidity;
  poolDayData.sqrtPrice = pool.sqrtPrice;
  poolDayData.feeGrowthGlobal0X128 = pool.feeGrowthGlobal0X128;
  poolDayData.feeGrowthGlobal1X128 = pool.feeGrowthGlobal1X128;
  poolDayData.tick = pool.tick;
  poolDayData.txCount = pool.txCount;

  return poolDayData;
}

async function updatePoolHourData(
  ctx: ContextWithEntityManager,
  block: BlockHeader,
  poolId: string
): Promise<PoolHourData | null> {
  let pool = await ctx.entities.getOrFail(Pool, poolId);
  let bundle = await ctx.entities.getOrFail(Bundle, "1");

  // Skip creating records if there's no valid price data
  if (pool.sqrtPrice === 0n) {
    return null;
  }

  let token0 = await ctx.entities.getOrFail(Token, pool.token0Id);
  let token1 = await ctx.entities.getOrFail(Token, pool.token1Id);
  let prices = sqrtPriceX96ToTokenPrices(
    pool.sqrtPrice,
    token0.decimals,
    token1.decimals,
    pool.id,
    token0.symbol,
    token1.symbol,
    new Date(block.timestamp).toISOString()
  );

  // Skip if we don't have valid prices
  if (prices[0] === 0 || prices[1] === 0) {
    return null;
  }

  let hourIndex = getHourIndex(block.timestamp);
  let hourPoolID = snapshotId(poolId, hourIndex);

  let poolHourData = ctx.entities.get(PoolHourData, hourPoolID, false);
  let isNewEntity = !poolHourData;
  
  if (!poolHourData) {
    poolHourData = createPoolHourData(poolId, hourIndex);
    ctx.entities.add(poolHourData);
  }

  // Update prices
  if (isNewEntity || poolHourData.open === 0) {
    poolHourData.open = prices[0];
  }
  if (isNewEntity || poolHourData.high === 0 || prices[0] > poolHourData.high) {
    poolHourData.high = prices[0];
  }
  if (isNewEntity || poolHourData.low === 0 || prices[0] < poolHourData.low) {
    poolHourData.low = prices[0];
  }
  poolHourData.close = prices[0];
  poolHourData.token0Price = prices[0];
  poolHourData.token1Price = prices[1];

  // Update TVL
  poolHourData.tvlUSD = pool.totalValueLockedUSD;
  poolHourData.liquidity = pool.liquidity;
  poolHourData.sqrtPrice = pool.sqrtPrice;
  poolHourData.feeGrowthGlobal0X128 = pool.feeGrowthGlobal0X128;
  poolHourData.feeGrowthGlobal1X128 = pool.feeGrowthGlobal1X128;
  poolHourData.tick = pool.tick;
  poolHourData.txCount = pool.txCount;

  return poolHourData;
}

async function updateTokenDayData(
  ctx: ContextWithEntityManager,
  block: BlockHeader,
  tokenId: string
): Promise<TokenDayData> {
  let bundle = await ctx.entities.getOrFail(Bundle, "1");
  let token = await ctx.entities.getOrFail(Token, tokenId);

  let dayID = getDayIndex(block.timestamp);
  let tokenDayID = snapshotId(tokenId, dayID);

  let tokenDayData = await ctx.entities.get(TokenDayData, tokenDayID, false);
  let isNewEntity = !tokenDayData;
  
  if (tokenDayData == null) {
    tokenDayData = createTokenDayData(tokenId, dayID);
    ctx.entities.add(tokenDayData);
  }

  // Calculate price only if we have valid inputs
  if (token.derivedETH > 0 && bundle.ethPriceUSD > 0) {
    let tokenPrice = token.derivedETH * bundle.ethPriceUSD;

    if (tokenPrice > 0) {
      if (isNewEntity || tokenDayData.high === 0 || tokenPrice > tokenDayData.high) {
        tokenDayData.high = tokenPrice;
      }

      if (isNewEntity || tokenDayData.low === 0 || tokenPrice < tokenDayData.low) {
        tokenDayData.low = tokenPrice;
      }

      tokenDayData.close = tokenPrice;
      tokenDayData.priceUSD = tokenPrice;
    }
  }

  // Only update TVL if values are non-zero
  if (token.totalValueLocked > 0) {
    tokenDayData.totalValueLocked = token.totalValueLocked;
  }
  if (token.totalValueLockedUSD > 0) {
    tokenDayData.totalValueLockedUSD = token.totalValueLockedUSD;
  }

  return tokenDayData;
}

async function updateTokenHourData(
  ctx: ContextWithEntityManager,
  block: BlockHeader,
  tokenId: string
): Promise<TokenHourData> {
  let bundle = await ctx.entities.getOrFail(Bundle, "1");
  let token = await ctx.entities.getOrFail(Token, tokenId);

  let hourID = getHourIndex(block.timestamp); 
  let tokenHourID = snapshotId(tokenId, hourID);

  let tokenHourData = ctx.entities.get(TokenHourData, tokenHourID, false);
  let isNewEntity = !tokenHourData;
  
  if (tokenHourData == null) {
    tokenHourData = createTokenHourData(tokenId, hourID);
    ctx.entities.add(tokenHourData);
  }

  // Calculate price only if we have valid inputs
  if (token.derivedETH > 0 && bundle.ethPriceUSD > 0) {
    let tokenPrice = token.derivedETH * bundle.ethPriceUSD;

    if (tokenPrice > 0) {
      if (isNewEntity || tokenHourData.high === 0 || tokenPrice > tokenHourData.high) {
        tokenHourData.high = tokenPrice;
      }

      if (isNewEntity || tokenHourData.low === 0 || tokenPrice < tokenHourData.low) {
        tokenHourData.low = tokenPrice;
      }

      tokenHourData.close = tokenPrice;
      tokenHourData.priceUSD = tokenPrice;
    }
  }

  // Only update TVL if values are non-zero
  if (token.totalValueLocked > 0) {
    tokenHourData.totalValueLocked = token.totalValueLocked;
  }
  if (token.totalValueLockedUSD > 0) {
    tokenHourData.totalValueLockedUSD = token.totalValueLockedUSD;
  }

  return tokenHourData;
}

async function updateTickDayData(
  ctx: ContextWithEntityManager,
  block: BlockHeader,
  tickId: string
): Promise<TickDayData> {
  let tick = await ctx.entities.getOrFail(Tick, tickId);

  let dayID = getDayIndex(block.timestamp);
  let tickDayDataID = snapshotId(tickId, dayID);

  let tickDayData = await ctx.entities.get(TickDayData, tickDayDataID);
  if (tickDayData == null) {
    tickDayData = createTickDayData(tickId, dayID);
    ctx.entities.add(tickDayData);
  }
  tickDayData.liquidityGross = tick.liquidityGross;
  tickDayData.liquidityNet = tick.liquidityNet;
  tickDayData.volumeToken0 = tick.volumeToken0;
  tickDayData.volumeToken1 = tick.volumeToken0;
  tickDayData.volumeUSD = tick.volumeUSD;
  tickDayData.feesUSD = tick.feesUSD;
  tickDayData.feeGrowthOutside0X128 = tick.feeGrowthOutside0X128;
  tickDayData.feeGrowthOutside1X128 = tick.feeGrowthOutside1X128;

  return tickDayData;
}

function createTransaction(
  block: { height: number; timestamp: number },
  transaction: { hash: string; gasPrice: bigint; gas: bigint }
) {
  return new Tx({
    id: transaction.hash,
    blockNumber: block.height,
    timestamp: new Date(block.timestamp),
    gasUsed: transaction.gas,
    gasPrice: transaction.gasPrice,
  });
}

function collectTokensFromPools(pools: Iterable<Pool>) {
  let ids = new Set<string>();
  for (let pool of pools) {
    ids.add(pool.token0Id);
    ids.add(pool.token1Id);
  }
  return ids;
}

function collectTicksFromPools(pools: Iterable<Pool>) {
  let ids = new Set<string>();
  for (let pool of pools) {
    ids.add(tickId(pool.id, pool.tick ?? 0));
  }
  return ids;
}

function collectWhiteListPoolsFromTokens(tokens: Iterable<Token>) {
  let ids = new Set<string>();
  for (let token of tokens) {
    token.whitelistPools.forEach((id) => ids.add(id));
  }
  return ids;
}

interface InitializeData {
  poolId: string;
  tick: number;
  sqrtPrice: bigint;
}

function processInitialize(log: EvmLog): InitializeData {
  let event = poolAbi.events.Initialize.decode(log);
  return {
    poolId: log.address,
    tick: event.tick,
    sqrtPrice: event.sqrtPriceX96,
  };
}

interface MintData {
  transaction: { hash: string; gasPrice: bigint; from: string; gas: bigint };
  poolId: string;
  amount0: bigint;
  amount1: bigint;
  amount: bigint;
  tickLower: number;
  tickUpper: number;
  sender: string;
  owner: string;
  logIndex: number;
}

function processMint(log: EvmLog, transaction: any): MintData {
  let event = poolAbi.events.Mint.decode(log);
  return {
    transaction: {
      hash: transaction.hash,
      gasPrice: transaction.gasPrice,
      from: transaction.from,
      gas: BigInt(transaction.gasUsed || 0),
    },
    poolId: log.address,
    amount0: event.amount0,
    amount1: event.amount1,
    amount: event.amount,
    tickLower: event.tickLower,
    tickUpper: event.tickUpper,
    sender: event.sender,
    owner: event.owner,
    logIndex: log.logIndex,
  };
}

interface BurnData {
  transaction: { hash: string; gasPrice: bigint; from: string; gas: bigint };
  poolId: string;
  amount0: bigint;
  amount1: bigint;
  amount: bigint;
  tickLower: number;
  tickUpper: number;
  owner: string;
  logIndex: number;
}

function processBurn(log: EvmLog, transaction: any): BurnData {
  let event = poolAbi.events.Burn.decode(log);
  return {
    transaction: {
      hash: transaction.hash,
      gasPrice: transaction.gasPrice,
      from: transaction.from,
      gas: BigInt(transaction.gasUsed || 0),
    },
    poolId: log.address,
    amount0: event.amount0,
    amount1: event.amount1,
    amount: event.amount,
    tickLower: event.tickLower,
    tickUpper: event.tickUpper,
    owner: event.owner,
    logIndex: log.logIndex,
  };
}

interface SwapData {
  transaction: { hash: string; gasPrice: bigint; from: string; gas: bigint };
  poolId: string;
  amount0: bigint;
  amount1: bigint;
  tick: number;
  sqrtPrice: bigint;
  sender: string;
  recipient: string;
  liquidity: bigint;
  logIndex: number;
}

function processSwap(log: EvmLog, transaction: any): SwapData {
  let event = poolAbi.events.Swap.decode(log);
  return {
    transaction: {
      hash: transaction.hash,
      gasPrice: transaction.gasPrice,
      from: transaction.from,
      gas: BigInt(transaction.gasUsed || 0),
    },
    poolId: log.address,
    amount0: event.amount0,
    amount1: event.amount1,
    tick: event.tick,
    sqrtPrice: event.sqrtPriceX96,
    sender: event.sender,
    recipient: event.recipient,
    logIndex: log.logIndex,
    liquidity: event.liquidity,
  };
}

export async function handleFlash(
  ctx: LogHandlerContext<Store>
): Promise<void> {
  // update fee growth
  let pool = await ctx.store.get(Pool, ctx.evmLog.address).then(assertNotNull);
  let poolContract = new poolAbi.Contract(ctx, ctx.evmLog.address);
  let feeGrowthGlobal0X128 = await poolContract.feeGrowthGlobal0X128();
  let feeGrowthGlobal1X128 = await poolContract.feeGrowthGlobal1X128();
  pool.feeGrowthGlobal0X128 = feeGrowthGlobal0X128;
  pool.feeGrowthGlobal1X128 = feeGrowthGlobal1X128;
  await ctx.store.save(pool);
}

async function updateTickFeeVars(
  ctx: BlockHandlerContext<Store>,
  ticks: Tick[]
): Promise<void> {
  if (!MULTICALL_ADDRESS) {
    // Fallback: fetch tick data individually
    for (const tick of ticks) {
      try {
        const pool = new poolAbi.Contract(ctx, tick.poolId);
        const tickData = await pool.ticks(tick.tickIdx);
        tick.feeGrowthOutside0X128 = tickData.feeGrowthOutside0X128;
        tick.feeGrowthOutside1X128 = tickData.feeGrowthOutside1X128;
      } catch (err) {
        ctx.log.warn(`Failed to fetch tick data for ${tick.id}: ${err}`);
      }
    }
    return;
  }

  // not all ticks are initialized so obtaining null is expected behavior
  let multicall = new Multicall(ctx, MULTICALL_ADDRESS!);

  const tickResult = await multicall.aggregate(
    poolAbi.functions.ticks,
    ticks.map<[string, {tick: bigint}]>((t) => {
      return [t.poolId, {
        tick: t.tickIdx
      }];
    }),
    MULTICALL_PAGE_SIZE
  );

  for (let i = 0; i < ticks.length; i++) {
    ticks[i].feeGrowthOutside0X128 = tickResult[i].feeGrowthOutside0X128;
    ticks[i].feeGrowthOutside1X128 = tickResult[i].feeGrowthOutside1X128;
  }
}

async function updatePoolFeeVars(
  ctx: BlockHandlerContext<Store>,
  pools: Pool[]
): Promise<void> {
  if (!MULTICALL_ADDRESS) {
    // Fallback: fetch pool fee data individually
    for (const pool of pools) {
      try {
        const poolContract = new poolAbi.Contract(ctx, pool.id);
        const fee0 = await poolContract.feeGrowthGlobal0X128();
        const fee1 = await poolContract.feeGrowthGlobal1X128();
        pool.feeGrowthGlobal0X128 = fee0;
        pool.feeGrowthGlobal1X128 = fee1;
      } catch (err) {
        ctx.log.warn(`Failed to fetch pool fee data for ${pool.id}: ${err}`);
      }
    }
    return;
  }

  let multicall = new Multicall(ctx, MULTICALL_ADDRESS!);

  const calls: [string, {}][] = pools.map((p) => {return [p.id, {}];})
  let fee0 = await multicall.aggregate(
    poolAbi.functions.feeGrowthGlobal0X128,
    calls,
    MULTICALL_PAGE_SIZE
  );
  let fee1 = await multicall.aggregate(
    poolAbi.functions.feeGrowthGlobal1X128,
    calls,
    MULTICALL_PAGE_SIZE
  );

  for (let i = 0; i < pools.length; i++) {
    pools[i].feeGrowthGlobal0X128 = fee0[i];
    pools[i].feeGrowthGlobal1X128 = fee1[i];
  }
}

function tickId(poolId: string, tickIdx: number) {
  return `${poolId}#${tickIdx}`;
}
