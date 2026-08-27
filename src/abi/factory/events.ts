import { address, int24, uint24 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** FeeAmountEnabled(uint24,int24) */
export const FeeAmountEnabled = event('0xc66a3fdf07232cdd185febcc6579d408c241b47ae2f9907d84be655141eeaecc', {
    fee: indexed(uint24),
    tickSpacing: indexed(int24),
})
export type FeeAmountEnabledEventArgs = EParams<typeof FeeAmountEnabled>

/** OwnerChanged(address,address) */
export const OwnerChanged = event('0xb532073b38c83145e3e5135377a08bf9aab55bc0fd7c1179cd4fb995d2a5159c', {
    oldOwner: indexed(address),
    newOwner: indexed(address),
})
export type OwnerChangedEventArgs = EParams<typeof OwnerChanged>

/** PoolCreated(address,address,uint24,int24,address) */
export const PoolCreated = event('0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118', {
    token0: indexed(address),
    token1: indexed(address),
    fee: indexed(uint24),
    tickSpacing: int24,
    pool: address,
})
export type PoolCreatedEventArgs = EParams<typeof PoolCreated>
