import { ContractBase } from '../abi.support.js'
import { symbol } from './functions.js'

export class Contract extends ContractBase {
    symbol() {
        return this.eth_call(symbol, {})
    }
}
