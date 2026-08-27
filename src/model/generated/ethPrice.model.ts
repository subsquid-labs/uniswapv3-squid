import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, Index as Index_, FloatColumn as FloatColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class EthPrice {
    constructor(props?: Partial<EthPrice>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_("idx_eth_price_block_number_f974e914")
    @IntColumn_({nullable: false})
    blockNumber!: number

    @IntColumn_({nullable: false})
    logIndex!: number

    @FloatColumn_({nullable: false})
    priceUSD!: number
}
