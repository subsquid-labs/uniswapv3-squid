import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, IntColumn as IntColumn_, DateTimeColumn as DateTimeColumn_, BigIntColumn as BigIntColumn_, OneToMany as OneToMany_} from "@subsquid/typeorm-store"
import {Mint} from "./mint.model"
import {Burn} from "./burn.model"
import {Swap} from "./swap.model"
import {Flash} from "./flash.model"
import {Collect} from "./collect.model"

@Entity_()
export class Tx {
    constructor(props?: Partial<Tx>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @IntColumn_({nullable: false})
    blockNumber!: number

    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    @BigIntColumn_({nullable: false})
    gasUsed!: bigint

    @BigIntColumn_({nullable: false})
    gasPrice!: bigint

    @OneToMany_(() => Mint, e => e.transaction)
    mints!: Mint[]

    @OneToMany_(() => Burn, e => e.transaction)
    burns!: Burn[]

    @OneToMany_(() => Swap, e => e.transaction)
    swaps!: Swap[]

    @OneToMany_(() => Flash, e => e.transaction)
    flashed!: Flash[]

    @OneToMany_(() => Collect, e => e.transaction)
    collects!: Collect[]
}
