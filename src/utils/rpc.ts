import {RpcClient} from '@subsquid/rpc-client'
import assert from 'assert'

/**
 * Contract reads used to ride on the processor's own chain client. The Portal
 * stream does not carry one, and the fallback source may not even be talking to
 * an RPC endpoint at any given moment, so state reads get their own client.
 *
 * Keeping it separate also means a batch's contract reads are unaffected by
 * which data source is currently active.
 */
let client: RpcClient | undefined

function getClient(): RpcClient {
    if (client == null) {
        const url = process.env.RPC_ETH_HTTP
        assert(url, 'contract state reads need an Ethereum RPC endpoint in RPC_ETH_HTTP')
        client = new RpcClient({url, capacity: 10, rateLimit: 10, retryAttempts: 3})
    }
    return client
}

export interface ContractContext {
    _chain: {client: {call: <T = any>(method: string, params?: unknown[]) => Promise<T>}}
    block: {height: number}
}

/**
 * Minimal context accepted by the typegen'd contract classes and by Multicall.
 * State is read at a fixed height so a batch's reads are reproducible.
 */
export function contractContext(height: number): ContractContext {
    const rpc = getClient()
    return {
        _chain: {client: {call: (method, params) => rpc.call(method, params as any[])}},
        block: {height},
    }
}
