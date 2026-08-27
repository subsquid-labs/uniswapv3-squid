import { ContractBase } from '../abi.support.js'
import { createPool, feeAmountTickSpacing, getPool, owner } from './functions.js'
import type { CreatePoolParams, FeeAmountTickSpacingParams, GetPoolParams } from './functions.js'

export class Contract extends ContractBase {
    createPool(tokenA: CreatePoolParams["tokenA"], tokenB: CreatePoolParams["tokenB"], fee: CreatePoolParams["fee"]) {
        return this.eth_call(createPool, {tokenA, tokenB, fee})
    }

    feeAmountTickSpacing(fee: FeeAmountTickSpacingParams["fee"]) {
        return this.eth_call(feeAmountTickSpacing, {fee})
    }

    getPool(tokenA: GetPoolParams["tokenA"], tokenB: GetPoolParams["tokenB"], fee: GetPoolParams["fee"]) {
        return this.eth_call(getPool, {tokenA, tokenB, fee})
    }

    owner() {
        return this.eth_call(owner, {})
    }
}
