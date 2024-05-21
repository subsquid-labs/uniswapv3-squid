import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, ManyToOne as ManyToOne_, Index as Index_, FloatColumn as FloatColumn_, DateTimeColumn as DateTimeColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"
import {Pool} from "./pool.model"

@Entity_()
export class Tick {
    constructor(props?: Partial<Tick>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: true})
    poolAddress!: string | undefined | null

    @BigIntColumn_({nullable: false})
    tickIdx!: bigint

    @StringColumn_({nullable: false})
    poolId!: string

    @Index_()
    @ManyToOne_(() => Pool, {nullable: true})
    pool!: Pool

    @BigIntColumn_({nullable: false})
    liquidityGross!: bigint

    @BigIntColumn_({nullable: false})
    liquidityNet!: bigint

    @FloatColumn_({nullable: false})
    price0!: number

    @FloatColumn_({nullable: false})
    price1!: number

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

    @FloatColumn_({nullable: false})
    collectedFeesToken0!: number

    @FloatColumn_({nullable: false})
    collectedFeesToken1!: number

    @FloatColumn_({nullable: false})
    collectedFeesUSD!: number

    @DateTimeColumn_({nullable: false})
    createdAtTimestamp!: Date

    @IntColumn_({nullable: false})
    createdAtBlockNumber!: number

    @BigIntColumn_({nullable: false})
    liquidityProviderCount!: bigint

    @BigIntColumn_({nullable: false})
    feeGrowthOutside0X128!: bigint

    @BigIntColumn_({nullable: false})
    feeGrowthOutside1X128!: bigint
}
