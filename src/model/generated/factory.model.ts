import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, FloatColumn as FloatColumn_, StringColumn as StringColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class Factory {
    constructor(props?: Partial<Factory>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @IntColumn_({nullable: false})
    poolCount!: number

    @IntColumn_({nullable: false})
    txCount!: number

    @FloatColumn_({nullable: false})
    totalVolumeUSD!: number

    @FloatColumn_({nullable: false})
    totalVolumeETH!: number

    @FloatColumn_({nullable: false})
    totalFeesUSD!: number

    @FloatColumn_({nullable: false})
    totalFeesETH!: number

    @FloatColumn_({nullable: false})
    untrackedVolumeUSD!: number

    @FloatColumn_({nullable: false})
    totalValueLockedUSD!: number

    @FloatColumn_({nullable: false})
    totalValueLockedETH!: number

    @FloatColumn_({nullable: false})
    totalValueLockedUSDUntracked!: number

    @FloatColumn_({nullable: false})
    totalValueLockedETHUntracked!: number

    @StringColumn_({nullable: false})
    owner!: string
}
