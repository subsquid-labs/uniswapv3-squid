import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, DateTimeColumn as DateTimeColumn_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Index as Index_, BigIntColumn as BigIntColumn_, FloatColumn as FloatColumn_} from "@subsquid/typeorm-store"
import {Tick} from "./tick.model"

@Entity_()
export class TickDayData {
    constructor(props?: Partial<TickDayData>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @DateTimeColumn_({nullable: false})
    date!: Date

    @StringColumn_({nullable: false})
    tickId!: string

    @Index_()
    @ManyToOne_(() => Tick, {nullable: true})
    tick!: Tick

    @BigIntColumn_({nullable: false})
    liquidityGross!: bigint

    @BigIntColumn_({nullable: false})
    liquidityNet!: bigint

    @FloatColumn_({nullable: false})
    volumeToken0!: number

    @FloatColumn_({nullable: false})
    volumeToken1!: number

    @FloatColumn_({nullable: false})
    volumeUSD!: number

    @FloatColumn_({nullable: false})
    feesUSD!: number

    @BigIntColumn_({nullable: false})
    feeGrowthOutside0X128!: bigint

    @BigIntColumn_({nullable: false})
    feeGrowthOutside1X128!: bigint
}
