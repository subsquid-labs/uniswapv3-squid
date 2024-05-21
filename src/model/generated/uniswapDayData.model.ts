import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, DateTimeColumn as DateTimeColumn_, FloatColumn as FloatColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class UniswapDayData {
    constructor(props?: Partial<UniswapDayData>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @DateTimeColumn_({nullable: false})
    date!: Date

    @FloatColumn_({nullable: false})
    volumeETH!: number

    @FloatColumn_({nullable: false})
    volumeUSD!: number

    @FloatColumn_({nullable: false})
    volumeUSDUntracked!: number

    @FloatColumn_({nullable: false})
    feesUSD!: number

    @IntColumn_({nullable: false})
    txCount!: number

    @FloatColumn_({nullable: false})
    tvlUSD!: number
}
