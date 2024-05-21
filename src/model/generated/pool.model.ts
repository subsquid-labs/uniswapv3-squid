import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, DateTimeColumn as DateTimeColumn_, IntColumn as IntColumn_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Index as Index_, BigIntColumn as BigIntColumn_, FloatColumn as FloatColumn_, OneToMany as OneToMany_} from "@subsquid/typeorm-store"
import {Token} from "./token.model"
import {PoolHourData} from "./poolHourData.model"
import {PoolDayData} from "./poolDayData.model"
import {Mint} from "./mint.model"
import {Burn} from "./burn.model"
import {Swap} from "./swap.model"
import {Collect} from "./collect.model"
import {Tick} from "./tick.model"

@Entity_()
export class Pool {
    constructor(props?: Partial<Pool>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @DateTimeColumn_({nullable: false})
    createdAtTimestamp!: Date

    @IntColumn_({nullable: false})
    createdAtBlockNumber!: number

    @StringColumn_({nullable: false})
    token0Id!: string

    @Index_()
    @ManyToOne_(() => Token, {nullable: true})
    token0!: Token

    @StringColumn_({nullable: false})
    token1Id!: string

    @Index_()
    @ManyToOne_(() => Token, {nullable: true})
    token1!: Token

    @IntColumn_({nullable: false})
    feeTier!: number

    @BigIntColumn_({nullable: false})
    liquidity!: bigint

    @BigIntColumn_({nullable: false})
    sqrtPrice!: bigint

    @BigIntColumn_({nullable: false})
    feeGrowthGlobal0X128!: bigint

    @BigIntColumn_({nullable: false})
    feeGrowthGlobal1X128!: bigint

    @FloatColumn_({nullable: false})
    token0Price!: number

    @FloatColumn_({nullable: false})
    token1Price!: number

    @IntColumn_({nullable: true})
    tick!: number | undefined | null

    @BigIntColumn_({nullable: false})
    observationIndex!: bigint

    @FloatColumn_({nullable: false})
    volumeToken0!: number

    @FloatColumn_({nullable: false})
    volumeToken1!: number

    @FloatColumn_({nullable: false})
    volumeUSD!: number

    @FloatColumn_({nullable: false})
    untrackedVolumeUSD!: number

    @FloatColumn_({nullable: false})
    feesUSD!: number

    @IntColumn_({nullable: false})
    txCount!: number

    @FloatColumn_({nullable: false})
    collectedFeesToken0!: number

    @FloatColumn_({nullable: false})
    collectedFeesToken1!: number

    @FloatColumn_({nullable: false})
    collectedFeesUSD!: number

    @FloatColumn_({nullable: false})
    totalValueLockedToken0!: number

    @FloatColumn_({nullable: false})
    totalValueLockedToken1!: number

    @FloatColumn_({nullable: false})
    totalValueLockedETH!: number

    @FloatColumn_({nullable: false})
    totalValueLockedUSD!: number

    @FloatColumn_({nullable: false})
    totalValueLockedUSDUntracked!: number

    @BigIntColumn_({nullable: false})
    liquidityProviderCount!: bigint

    @OneToMany_(() => PoolHourData, e => e.pool)
    poolHourData!: PoolHourData[]

    @OneToMany_(() => PoolDayData, e => e.pool)
    poolDayData!: PoolDayData[]

    @OneToMany_(() => Mint, e => e.pool)
    mints!: Mint[]

    @OneToMany_(() => Burn, e => e.pool)
    burns!: Burn[]

    @OneToMany_(() => Swap, e => e.pool)
    swaps!: Swap[]

    @OneToMany_(() => Collect, e => e.pool)
    collects!: Collect[]

    @OneToMany_(() => Tick, e => e.pool)
    ticks!: Tick[]
}
