import { ContractBase } from '../abi.support.js'
import { name } from './functions.js'

export class Contract extends ContractBase {
    name() {
        return this.eth_call(name, {})
    }
}
