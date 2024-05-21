import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, DateTimeColumn as DateTimeColumn_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Index as Index_, BigIntColumn as BigIntColumn_, FloatColumn as FloatColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"
import {Pool} from "./pool.model"

@Entity_()
export class PoolHourData {
    constructor(props?: Partial<PoolHourData>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @DateTimeColumn_({nullable: false})
    date!: Date

    @StringColumn_({nullable: false})
    poolId!: string

    @Index_()
    @ManyToOne_(() => Pool, {nullable: true})
    pool!: Pool

    @BigIntColumn_({nullable: false})
    liquidity!: bigint

    @BigIntColumn_({nullable: false})
    sqrtPrice!: bigint

    @FloatColumn_({nullable: false})
    token0Price!: number

    @FloatColumn_({nullable: false})
    token1Price!: number

    @IntColumn_({nullable: true})
    tick!: number | undefined | null

    @BigIntColumn_({nullable: false})
    feeGrowthGlobal0X128!: bigint

    @BigIntColumn_({nullable: false})
    feeGrowthGlobal1X128!: bigint

    @FloatColumn_({nullable: false})
    tvlUSD!: number

    @FloatColumn_({nullable: false})
    volumeToken0!: number

    @FloatColumn_({nullable: false})
    volumeToken1!: number

    @FloatColumn_({nullable: false})
    volumeUSD!: number

    @FloatColumn_({nullable: false})
    feesUSD!: number

    @IntColumn_({nullable: false})
    txCount!: number

    @FloatColumn_({nullable: false})
    open!: number

    @FloatColumn_({nullable: false})
    high!: number

    @FloatColumn_({nullable: false})
    low!: number

    @FloatColumn_({nullable: false})
    close!: number
}
