import { In } from "typeorm";
import { DataHandlerContext, assertNotNull } from "@subsquid/evm-processor";
import { Store, TypeormDatabase } from "@subsquid/typeorm-store";
import * as factoryAbi from "./abi/factory";
import * as poolAbi from "./abi/pool";
//import { CustomDatabase } from "./customDB";
import { Block, Fields, Log, Transaction, processor } from "./processor";
import { EntityManager } from "./utils/entityManager";
import { processFactory } from "./mappings/factory";
import { processPairs } from "./mappings/core";
import { processPositions } from "./mappings/positionManager";
export const FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
import {
  Bundle,
  Burn,
  Factory,
  Mint,
  Pool,
  PoolDayData,
  PoolHourData,
  Position,
  Swap,
  Tick,
  TickDayData,
  Token,
  TokenDayData,
  TokenHourData,
  Tx,
  UniswapDayData,
} from "./model";
import { dbOptions } from "./tables";
import { TransactionItem } from "./utils/interfaces/interfaces";
import { EvmLog } from "@subsquid/evm-processor/src/interfaces/evm";
import { Wrapper } from "./wrapper";
let factoryPools: Set<string>;
//let db = new CustomDatabase(dbOptions);
let dw = new Wrapper(dbOptions);
processor.run(dw, async (ctx) => {
  const entities = new EntityManager(ctx.store);
  const entitiesCtx = { ...ctx, entities };
  //@ts-ignore
  await processFactory(entitiesCtx, ctx.blocks);
  //@ts-ignore
  await processPairs(entitiesCtx, ctx.blocks);
  //@ts-ignore
  await processPositions(entitiesCtx, ctx.blocks);

  console.log("TABLES");
  console.log(dw.db.tables);
  console.log("TABS");
  console.log(ctx.store.CreateFactoryTable);

  await ctx.store.save(entities.values(Bundle));
  await ctx.store.save(entities.values(Factory));
  await ctx.store.save(entities.values(Token));
  await ctx.store.save(entities.values(Pool));
  await ctx.store.save(entities.values(Tick));

  await ctx.store.CreateFactoryTable.writeMany(entities.values(Tick));
  await ctx.store.CreatePoolTable.writeMany(entities.values(Pool));
  await ctx.store.insert(entities.values(Tx));
  await ctx.store.insert(entities.values(Mint));
  await ctx.store.insert(entities.values(Burn));
  await ctx.store.insert(entities.values(Swap));
  await ctx.store.save(entities.values(UniswapDayData));
  await ctx.store.save(entities.values(PoolDayData));
  await ctx.store.save(entities.values(PoolHourData)); //
  await ctx.store.save(entities.values(TokenDayData));
  await ctx.store.save(entities.values(TokenHourData));
  await ctx.store.save(entities.values(TickDayData)); //
  await ctx.store.save(entities.values(Position));
});
