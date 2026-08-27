import { address, int24, uint24 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** createPool(address,address,uint24) */
export const createPool = func('0xa1671295', {
    tokenA: address,
    tokenB: address,
    fee: uint24,
}, address)
export type CreatePoolParams = FunctionArguments<typeof createPool>
export type CreatePoolReturn = FunctionReturn<typeof createPool>

/** enableFeeAmount(uint24,int24) */
export const enableFeeAmount = func('0x8a7c195f', {
    fee: uint24,
    tickSpacing: int24,
})
export type EnableFeeAmountParams = FunctionArguments<typeof enableFeeAmount>
export type EnableFeeAmountReturn = FunctionReturn<typeof enableFeeAmount>

/** feeAmountTickSpacing(uint24) */
export const feeAmountTickSpacing = func('0x22afcccb', {
    fee: uint24,
}, int24)
export type FeeAmountTickSpacingParams = FunctionArguments<typeof feeAmountTickSpacing>
export type FeeAmountTickSpacingReturn = FunctionReturn<typeof feeAmountTickSpacing>

/** getPool(address,address,uint24) */
export const getPool = func('0x1698ee82', {
    tokenA: address,
    tokenB: address,
    fee: uint24,
}, address)
export type GetPoolParams = FunctionArguments<typeof getPool>
export type GetPoolReturn = FunctionReturn<typeof getPool>

/** owner() */
export const owner = func('0x8da5cb5b', {}, address)
export type OwnerParams = FunctionArguments<typeof owner>
export type OwnerReturn = FunctionReturn<typeof owner>

/** setOwner(address) */
export const setOwner = func('0x13af4035', {
    _owner: address,
})
export type SetOwnerParams = FunctionArguments<typeof setOwner>
export type SetOwnerReturn = FunctionReturn<typeof setOwner>
