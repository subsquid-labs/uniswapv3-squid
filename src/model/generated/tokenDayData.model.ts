import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, DateTimeColumn as DateTimeColumn_, StringColumn as StringColumn_, ManyToOne as ManyToOne_, Index as Index_, Relation as Relation_, FloatColumn as FloatColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {Token} from "./token.model"

@Entity_()
export class TokenDayData {
    constructor(props?: Partial<TokenDayData>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @DateTimeColumn_({nullable: false})
    date!: Date

    @StringColumn_({nullable: false})
    tokenId!: string

    @Index_("idx_token_day_data_token_a3c16d52")
    @ManyToOne_(() => Token, {nullable: true})
    token!: Relation_<Token>

    @FloatColumn_({nullable: false})
    volume!: number

    @FloatColumn_({nullable: false})
    volumeUSD!: number

    @FloatColumn_({nullable: false})
    untrackedVolumeUSD!: number

    @FloatColumn_({nullable: false})
    totalValueLocked!: number

    @FloatColumn_({nullable: false})
    totalValueLockedUSD!: number

    @FloatColumn_({nullable: false})
    priceUSD!: number

    @FloatColumn_({nullable: false})
    feesUSD!: number

    @FloatColumn_({nullable: false})
    open!: number

    @FloatColumn_({nullable: false})
    high!: number

    @FloatColumn_({nullable: false})
    low!: number

    @FloatColumn_({nullable: false})
    close!: number

    @BigIntColumn_({nullable: true})
    openOrder!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    closeOrder!: bigint | undefined | null
}
