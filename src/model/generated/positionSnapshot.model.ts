import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, IntColumn as IntColumn_, DateTimeColumn as DateTimeColumn_, BigIntColumn as BigIntColumn_, FloatColumn as FloatColumn_} from "@subsquid/typeorm-store"
import {Pool} from "./pool.model"
import {Position} from "./position.model"
import {Tx} from "./tx.model"

@Entity_()
export class PositionSnapshot {
    constructor(props?: Partial<PositionSnapshot>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @StringColumn_({nullable: false})
    owner!: string

    @StringColumn_({nullable: false})
    poolId!: string

    @Index_("idx_position_snapshot_pool_fb258df8")
    @ManyToOne_(() => Pool, {nullable: true})
    pool!: Relation_<Pool>

    @StringColumn_({nullable: false})
    positionId!: string

    @Index_("idx_position_snapshot_position_f1acf84d")
    @ManyToOne_(() => Position, {nullable: true})
    position!: Relation_<Position>

    @IntColumn_({nullable: false})
    blockNumber!: number

    @DateTimeColumn_({nullable: false})
    timestamp!: Date

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

    @StringColumn_({nullable: false})
    transactionId!: string

    @Index_("idx_position_snapshot_transaction_2bf4801c")
    @ManyToOne_(() => Tx, {nullable: true})
    transaction!: Relation_<Tx>

    @BigIntColumn_({nullable: false})
    feeGrowthInside0LastX128!: bigint

    @BigIntColumn_({nullable: false})
    feeGrowthInside1LastX128!: bigint
}
