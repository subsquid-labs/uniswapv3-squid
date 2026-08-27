import { ContractBase } from '../abi.support.js'
import { allowance, approve, balanceOf, decimals, name, symbol, totalSupply, transfer, transferFrom } from './functions.js'
import type { AllowanceParams, ApproveParams, BalanceOfParams, TransferFromParams, TransferParams } from './functions.js'

export class Contract extends ContractBase {
    name() {
        return this.eth_call(name, {})
    }

    approve(_spender: ApproveParams["_spender"], _value: ApproveParams["_value"]) {
        return this.eth_call(approve, {_spender, _value})
    }

    totalSupply() {
        return this.eth_call(totalSupply, {})
    }

    transferFrom(_from: TransferFromParams["_from"], _to: TransferFromParams["_to"], _value: TransferFromParams["_value"]) {
        return this.eth_call(transferFrom, {_from, _to, _value})
    }

    decimals() {
        return this.eth_call(decimals, {})
    }

    balanceOf(_owner: BalanceOfParams["_owner"]) {
        return this.eth_call(balanceOf, {_owner})
    }

    symbol() {
        return this.eth_call(symbol, {})
    }

    transfer(_to: TransferParams["_to"], _value: TransferParams["_value"]) {
        return this.eth_call(transfer, {_to, _value})
    }

    allowance(_owner: AllowanceParams["_owner"], _spender: AllowanceParams["_spender"]) {
        return this.eth_call(allowance, {_owner, _spender})
    }
}
