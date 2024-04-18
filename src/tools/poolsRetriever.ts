import assert from 'assert'
import {lookupArchive} from '@subsquid/archive-registry'
import {EvmBatchProcessor} from '@subsquid/evm-processor'
import {Database, LocalDest} from '@subsquid/file-store'
import * as factoryAbi from '../abi/factory'
import {
  FACTORY_ADDRESS,
  FACTORY_DEPLOYED_AT
} from '../utils/constants'

const processor = new EvmBatchProcessor()
  .setDataSource({
    archive: lookupArchive('eth-mainnet'),
    chain: {url: 'https://rpc.ankr.com/eth', maxBatchCallSize: 10},
  })
  .setBlockRange({
    from: FACTORY_DEPLOYED_AT,
  })
  .setFields({
    log: {
      topics: true,
      data: true,
    },
  })
  .addLog({
    address: [FACTORY_ADDRESS],
    topic0: [factoryAbi.events.PoolCreated.topic],
  })
  .setFinalityConfirmation(100)

let pools: string[] = []

type Metadata = {
  height: number
  hash: string
  pools: string[]
}

let poolsInitialized = false
let poolsReady = false

let db = new Database({
  tables: {},
  dest: new LocalDest('./assets'),
  chunkSizeMb: Infinity,
  hooks: {
    async onStateRead(dest) {
      if (await dest.exists('pools.json')) {
        let {height, hash, pools: retrievedPools}: Metadata = await dest.readFile('pools.json').then(JSON.parse)
        if (!poolsInitialized) {
          pools = retrievedPools
          poolsInitialized = true
        }
        return {height, hash}
      } else {
        return undefined
      }
    },
    async onStateUpdate(dest, info) {
      let metadata: Metadata = {
        ...info,
        pools
      }
      await dest.writeFile('pools.json', JSON.stringify(metadata))
    },
  },
})

processor.run(db, async (ctx) => {
  if (poolsReady) process.exit()
  if (ctx.isHead) poolsReady = true

  for (let c of ctx.blocks) {
    for (let l of c.logs) {
      if (l.address === FACTORY_ADDRESS) {
        let {pool} = factoryAbi.events.PoolCreated.decode(l)
        pools.push(pool.toLowerCase())
      }
    }
  }

  ctx.log.info(`pools: ${pools.length}`)
  ctx.store.setForceFlush(true)
})
