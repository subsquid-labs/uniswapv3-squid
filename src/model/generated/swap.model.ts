import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_, DateTimeColumn as DateTimeColumn_, FloatColumn as FloatColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"
import {Tx} from "./tx.model"
import {Pool} from "./pool.model"
import {Token} from "./token.model"

@Entity_()
export class Swap {
    constructor(props?: Partial<Swap>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_swap_transaction_08544ea0")
    @ManyToOne_(() => Tx, {nullable: true})
    transaction!: Relation_<Tx>

    @StringColumn_({nullable: false})
    transactionId!: string

    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    @Index_("idx_swap_pool_689d45a4")
    @ManyToOne_(() => Pool, {nullable: true})
    pool!: Relation_<Pool>

    @StringColumn_({nullable: false})
    poolId!: string

    @StringColumn_({nullable: false})
    token0Id!: string

    @Index_("idx_swap_token0_675f4634")
    @ManyToOne_(() => Token, {nullable: true})
    token0!: Relation_<Token>

    @StringColumn_({nullable: false})
    token1Id!: string

    @Index_("idx_swap_token1_bad45593")
    @ManyToOne_(() => Token, {nullable: true})
    token1!: Relation_<Token>

    @StringColumn_({nullable: false})
    sender!: string

    @StringColumn_({nullable: false})
    recipient!: string

    @StringColumn_({nullable: false})
    origin!: string

    @FloatColumn_({nullable: false})
    amount0!: number

    @FloatColumn_({nullable: false})
    amount1!: number

    @FloatColumn_({nullable: false})
    amountUSD!: number

    @BigIntColumn_({nullable: false})
    sqrtPriceX96!: bigint

    @IntColumn_({nullable: false})
    tick!: number

    @IntColumn_({nullable: true})
    logIndex!: number | undefined | null
}
