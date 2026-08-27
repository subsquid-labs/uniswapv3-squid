import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, DateTimeColumn as DateTimeColumn_, BigIntColumn as BigIntColumn_, FloatColumn as FloatColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"
import {Tx} from "./tx.model"
import {Pool} from "./pool.model"
import {Token} from "./token.model"

@Entity_()
export class Mint {
    constructor(props?: Partial<Mint>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    transactionId!: string

    @Index_("idx_mint_transaction_4338d331")
    @ManyToOne_(() => Tx, {nullable: true})
    transaction!: Relation_<Tx>

    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    @StringColumn_({nullable: false})
    poolId!: string

    @Index_("idx_mint_pool_8483b325")
    @ManyToOne_(() => Pool, {nullable: true})
    pool!: Relation_<Pool>

    @StringColumn_({nullable: false})
    token0Id!: string

    @Index_("idx_mint_token0_82787727")
    @ManyToOne_(() => Token, {nullable: true})
    token0!: Relation_<Token>

    @StringColumn_({nullable: false})
    token1Id!: string

    @Index_("idx_mint_token1_b37be399")
    @ManyToOne_(() => Token, {nullable: true})
    token1!: Relation_<Token>

    @StringColumn_({nullable: false})
    owner!: string

    @StringColumn_({nullable: true})
    sender!: string | undefined | null

    @StringColumn_({nullable: false})
    origin!: string

    @BigIntColumn_({nullable: false})
    amount!: bigint

    @FloatColumn_({nullable: false})
    amount0!: number

    @FloatColumn_({nullable: false})
    amount1!: number

    @FloatColumn_({nullable: true})
    amountUSD!: number | undefined | null

    @IntColumn_({nullable: false})
    tickLower!: number

    @IntColumn_({nullable: false})
    tickUpper!: number

    @IntColumn_({nullable: true})
    logIndex!: number | undefined | null
}
