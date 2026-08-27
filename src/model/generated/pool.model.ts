import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, DateTimeColumn as DateTimeColumn_, IntColumn as IntColumn_, Index as Index_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Relation as Relation_, BigIntColumn as BigIntColumn_, FloatColumn as FloatColumn_, OneToMany as OneToMany_} from "@subsquid/typeorm-store"
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

    @Index_("idx_pool_created_at_block_number_8c3eb804")
    @IntColumn_({nullable: false})
    createdAtBlockNumber!: number

    @StringColumn_({nullable: false})
    token0Id!: string

    @Index_("idx_pool_token0_f90d107b")
    @ManyToOne_(() => Token, {nullable: true})
    token0!: Relation_<Token>

    @StringColumn_({nullable: false})
    token1Id!: string

    @Index_("idx_pool_token1_ce96e177")
    @ManyToOne_(() => Token, {nullable: true})
    token1!: Relation_<Token>

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
    poolHourData!: Relation_<PoolHourData[]>

    @OneToMany_(() => PoolDayData, e => e.pool)
    poolDayData!: Relation_<PoolDayData[]>

    @OneToMany_(() => Mint, e => e.pool)
    mints!: Relation_<Mint[]>

    @OneToMany_(() => Burn, e => e.pool)
    burns!: Relation_<Burn[]>

    @OneToMany_(() => Swap, e => e.pool)
    swaps!: Relation_<Swap[]>

    @OneToMany_(() => Collect, e => e.pool)
    collects!: Relation_<Collect[]>

    @OneToMany_(() => Tick, e => e.pool)
    ticks!: Relation_<Tick[]>
}
