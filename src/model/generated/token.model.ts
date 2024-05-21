import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, IntColumn as IntColumn_, BigIntColumn as BigIntColumn_, FloatColumn as FloatColumn_, OneToMany as OneToMany_} from "@subsquid/typeorm-store"
import {TokenDayData} from "./tokenDayData.model"

@Entity_()
export class Token {
    constructor(props?: Partial<Token>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    symbol!: string

    @StringColumn_({nullable: false})
    name!: string

    @IntColumn_({nullable: false})
    decimals!: number

    @BigIntColumn_({nullable: false})
    totalSupply!: bigint

    @FloatColumn_({nullable: false})
    volume!: number

    @FloatColumn_({nullable: false})
    volumeUSD!: number

    @FloatColumn_({nullable: false})
    untrackedVolumeUSD!: number

    @FloatColumn_({nullable: false})
    feesUSD!: number

    @IntColumn_({nullable: false})
    txCount!: number

    @BigIntColumn_({nullable: false})
    poolCount!: bigint

    @FloatColumn_({nullable: false})
    totalValueLocked!: number

    @FloatColumn_({nullable: false})
    totalValueLockedUSD!: number

    @FloatColumn_({nullable: false})
    totalValueLockedUSDUntracked!: number

    @FloatColumn_({nullable: false})
    derivedETH!: number

    @StringColumn_({array: true, nullable: false})
    whitelistPools!: (string)[]

    @OneToMany_(() => TokenDayData, e => e.token)
    tokenDayData!: TokenDayData[]
}
