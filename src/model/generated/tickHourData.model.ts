import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, DateTimeColumn as DateTimeColumn_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Index as Index_, BigIntColumn as BigIntColumn_, FloatColumn as FloatColumn_} from "@subsquid/typeorm-store"
import {Pool} from "./pool.model"
import {Tick} from "./tick.model"

@Entity_()
export class TickHourData {
    constructor(props?: Partial<TickHourData>) {
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
}
