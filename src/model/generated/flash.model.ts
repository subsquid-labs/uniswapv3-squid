import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, StringColumn as StringColumn_, DateTimeColumn as DateTimeColumn_, FloatColumn as FloatColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"
import {Tx} from "./tx.model"
import {Pool} from "./pool.model"

@Entity_()
export class Flash {
    constructor(props?: Partial<Flash>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_flash_transaction_651858e4")
    @ManyToOne_(() => Tx, {nullable: true})
    transaction!: Relation_<Tx>

    @StringColumn_({nullable: false})
    transactionId!: string

    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    @StringColumn_({nullable: false})
    poolId!: string

    @Index_("idx_flash_pool_76a5bfb4")
    @ManyToOne_(() => Pool, {nullable: true})
    pool!: Relation_<Pool>

    @StringColumn_({nullable: false})
    sender!: string

    @StringColumn_({nullable: false})
    recipient!: string

    @FloatColumn_({nullable: false})
    amount0!: number

    @FloatColumn_({nullable: false})
    amount1!: number

    @FloatColumn_({nullable: false})
    amountUSD!: number

    @FloatColumn_({nullable: false})
    amount0Paid!: number

    @FloatColumn_({nullable: false})
    amount1Paid!: number

    @IntColumn_({nullable: true})
    logIndex!: number | undefined | null
}
