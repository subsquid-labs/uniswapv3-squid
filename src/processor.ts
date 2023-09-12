import { lookupArchive } from "@subsquid/archive-registry";
import { FACTORY_ADDRESS, POSITIONS_ADDRESS } from "./utils/constants";

import {
  BlockHeader,
  DataHandlerContext,
  EvmBatchProcessor,
  EvmBatchProcessorFields,
  Log as _Log,
  Transaction as _Transaction,
} from "@subsquid/evm-processor";

import * as factoryAbi from "./abi/factory";
import * as poolAbi from "./abi/pool";
import * as positionsAbi from "./abi/NonfungiblePositionManager";

export const processor = new EvmBatchProcessor()
  .setDataSource({
    archive: lookupArchive("eth-mainnet"),
    chain: "https://rpc.ankr.com/eth/",
  })
  .setFinalityConfirmation(75)
  .addLog({
    address: [FACTORY_ADDRESS],
    topic0: [factoryAbi.events.PoolCreated.topic],
    transaction: true,
  })
  .addLog({
    topic0: [
      poolAbi.events.Burn.topic,
      poolAbi.events.Mint.topic,
      poolAbi.events.Initialize.topic,
      poolAbi.events.Swap.topic,
    ],
    transaction: true,
  })
  .addLog({
    topic0: [
      positionsAbi.events.IncreaseLiquidity.topic,
      positionsAbi.events.DecreaseLiquidity.topic,
      positionsAbi.events.Collect.topic,
      positionsAbi.events.Transfer.topic,
    ],
    address: [POSITIONS_ADDRESS],
    transaction: true,
  })
  .setFields({
    transaction: {
      from: true,
      value: true,
      hash: true,
      gasUsed: true,
      gasPrice: true,
    },
    log: {
      topics: true,
      data: true,
    },
  })
  .setBlockRange({
    from: 12000000,
  });

export type Fields = EvmBatchProcessorFields<typeof processor>;
export type Block = BlockHeader<Fields>;
export type Log = _Log<Fields>;
export type Transaction = _Transaction<Fields>;
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>;
