import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Index as Index_, BigIntColumn as BigIntColumn_, FloatColumn as FloatColumn_} from "@subsquid/typeorm-store"
import {Pool} from "./pool.model"
import {Token} from "./token.model"

@Entity_()
export class Position {
    constructor(props?: Partial<Position>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    owner!: string

    @StringColumn_({nullable: false})
    poolId!: string

    @Index_()
    @ManyToOne_(() => Pool, {nullable: true})
    pool!: Pool

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

    @BigIntColumn_({nullable: false})
    liquidity!: bigint

    @FloatColumn_({nullable: false})
    depositedToken0!: number

    @FloatColumn_({nullable: false})
    depositedToken1!: number

    @FloatColumn_({nullable: false})
    withdrawnToken0!: number

    @FloatColumn_({nullable: false})
    withdrawnToken1!: number

    @FloatColumn_({nullable: false})
    collectedFeesToken0!: number

    @FloatColumn_({nullable: false})
    collectedFeesToken1!: number

    @BigIntColumn_({nullable: false})
    feeGrowthInside0LastX128!: bigint

    @BigIntColumn_({nullable: false})
    feeGrowthInside1LastX128!: bigint
}
