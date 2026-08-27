import { address, int24, int256, uint128, uint16, uint160, uint256, uint8 } from '@subsquid/evm-codec'
import { event, indexed } from '../abi.support.js'
import type { EventParams as EParams } from '../abi.support.js'

/** Burn(address,int24,int24,uint128,uint256,uint256) */
export const Burn = event('0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c', {
    owner: indexed(address),
    tickLower: indexed(int24),
    tickUpper: indexed(int24),
    amount: uint128,
    amount0: uint256,
    amount1: uint256,
})
export type BurnEventArgs = EParams<typeof Burn>

/** Collect(address,address,int24,int24,uint128,uint128) */
export const Collect = event('0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0', {
    owner: indexed(address),
    recipient: address,
    tickLower: indexed(int24),
    tickUpper: indexed(int24),
    amount0: uint128,
    amount1: uint128,
})
export type CollectEventArgs = EParams<typeof Collect>

/** CollectProtocol(address,address,uint128,uint128) */
export const CollectProtocol = event('0x596b573906218d3411850b26a6b437d6c4522fdb43d2d2386263f86d50b8b151', {
    sender: indexed(address),
    recipient: indexed(address),
    amount0: uint128,
    amount1: uint128,
})
export type CollectProtocolEventArgs = EParams<typeof CollectProtocol>

/** Flash(address,address,uint256,uint256,uint256,uint256) */
export const Flash = event('0xbdbdb71d7860376ba52b25a5028beea23581364a40522f6bcfb86bb1f2dca633', {
    sender: indexed(address),
    recipient: indexed(address),
    amount0: uint256,
    amount1: uint256,
    paid0: uint256,
    paid1: uint256,
})
export type FlashEventArgs = EParams<typeof Flash>

/** IncreaseObservationCardinalityNext(uint16,uint16) */
export const IncreaseObservationCardinalityNext = event('0xac49e518f90a358f652e4400164f05a5d8f7e35e7747279bc3a93dbf584e125a', {
    observationCardinalityNextOld: uint16,
    observationCardinalityNextNew: uint16,
})
export type IncreaseObservationCardinalityNextEventArgs = EParams<typeof IncreaseObservationCardinalityNext>

/** Initialize(uint160,int24) */
export const Initialize = event('0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95', {
    sqrtPriceX96: uint160,
    tick: int24,
})
export type InitializeEventArgs = EParams<typeof Initialize>

/** Mint(address,address,int24,int24,uint128,uint256,uint256) */
export const Mint = event('0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde', {
    sender: address,
    owner: indexed(address),
    tickLower: indexed(int24),
    tickUpper: indexed(int24),
    amount: uint128,
    amount0: uint256,
    amount1: uint256,
})
export type MintEventArgs = EParams<typeof Mint>

/** SetFeeProtocol(uint8,uint8,uint8,uint8) */
export const SetFeeProtocol = event('0x973d8d92bb299f4af6ce49b52a8adb85ae46b9f214c4c4fc06ac77401237b133', {
    feeProtocol0Old: uint8,
    feeProtocol1Old: uint8,
    feeProtocol0New: uint8,
    feeProtocol1New: uint8,
})
export type SetFeeProtocolEventArgs = EParams<typeof SetFeeProtocol>

/** Swap(address,address,int256,int256,uint160,uint128,int24) */
export const Swap = event('0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67', {
    sender: indexed(address),
    recipient: indexed(address),
    amount0: int256,
    amount1: int256,
    sqrtPriceX96: uint160,
    liquidity: uint128,
    tick: int24,
})
export type SwapEventArgs = EParams<typeof Swap>
