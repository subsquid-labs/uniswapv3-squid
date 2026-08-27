import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, DateTimeColumn as DateTimeColumn_, FloatColumn as FloatColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"
import {Tx} from "./tx.model"
import {Pool} from "./pool.model"

@Entity_()
export class Collect {
    constructor(props?: Partial<Collect>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    transactionId!: string

    @Index_("idx_collect_transaction_3b74f86f")
    @ManyToOne_(() => Tx, {nullable: true})
    transaction!: Relation_<Tx>

    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    @StringColumn_({nullable: false})
    poolId!: string

    @Index_("idx_collect_pool_84e990c2")
    @ManyToOne_(() => Pool, {nullable: true})
    pool!: Relation_<Pool>

    @StringColumn_({nullable: true})
    owner!: string | undefined | null

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
