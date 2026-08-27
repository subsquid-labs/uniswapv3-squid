import { address, bool, uint128, uint256 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** Approval(address,address,uint256) */
export const Approval = event('0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925', {
    owner: indexed(address),
    approved: indexed(address),
    tokenId: indexed(uint256),
})
export type ApprovalEventArgs = EParams<typeof Approval>

/** ApprovalForAll(address,address,bool) */
export const ApprovalForAll = event('0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31', {
    owner: indexed(address),
    operator: indexed(address),
    approved: bool,
})
export type ApprovalForAllEventArgs = EParams<typeof ApprovalForAll>

/** Collect(uint256,address,uint256,uint256) */
export const Collect = event('0x40d0efd1a53d60ecbf40971b9daf7dc90178c3aadc7aab1765632738fa8b8f01', {
    tokenId: indexed(uint256),
    recipient: address,
    amount0: uint256,
    amount1: uint256,
})
export type CollectEventArgs = EParams<typeof Collect>

/** DecreaseLiquidity(uint256,uint128,uint256,uint256) */
export const DecreaseLiquidity = event('0x26f6a048ee9138f2c0ce266f322cb99228e8d619ae2bff30c67f8dcf9d2377b4', {
    tokenId: indexed(uint256),
    liquidity: uint128,
    amount0: uint256,
    amount1: uint256,
})
export type DecreaseLiquidityEventArgs = EParams<typeof DecreaseLiquidity>

/** IncreaseLiquidity(uint256,uint128,uint256,uint256) */
export const IncreaseLiquidity = event('0x3067048beee31b25b2f1681f88dac838c8bba36af25bfb2b7cf7473a5847e35f', {
    tokenId: indexed(uint256),
    liquidity: uint128,
    amount0: uint256,
    amount1: uint256,
})
export type IncreaseLiquidityEventArgs = EParams<typeof IncreaseLiquidity>

/** Transfer(address,address,uint256) */
export const Transfer = event('0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', {
    from: indexed(address),
    to: indexed(address),
    tokenId: indexed(uint256),
})
export type TransferEventArgs = EParams<typeof Transfer>
