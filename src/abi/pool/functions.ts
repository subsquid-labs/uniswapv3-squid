import { address, array, bool, bytes, bytes32, int128, int16, int24, int256, int56, struct, uint128, uint16, uint160, uint24, uint256, uint32, uint8 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** burn(int24,int24,uint128) */
export const burn = func('0xa34123a7', {
    tickLower: int24,
    tickUpper: int24,
    amount: uint128,
}, struct({
    amount0: uint256,
    amount1: uint256,
}))
export type BurnParams = FunctionArguments<typeof burn>
export type BurnReturn = FunctionReturn<typeof burn>

/** collect(address,int24,int24,uint128,uint128) */
export const collect = func('0x4f1eb3d8', {
    recipient: address,
    tickLower: int24,
    tickUpper: int24,
    amount0Requested: uint128,
    amount1Requested: uint128,
}, struct({
    amount0: uint128,
    amount1: uint128,
}))
export type CollectParams = FunctionArguments<typeof collect>
export type CollectReturn = FunctionReturn<typeof collect>

/** collectProtocol(address,uint128,uint128) */
export const collectProtocol = func('0x85b66729', {
    recipient: address,
    amount0Requested: uint128,
    amount1Requested: uint128,
}, struct({
    amount0: uint128,
    amount1: uint128,
}))
export type CollectProtocolParams = FunctionArguments<typeof collectProtocol>
export type CollectProtocolReturn = FunctionReturn<typeof collectProtocol>

/** factory() */
export const factory = func('0xc45a0155', {}, address)
export type FactoryParams = FunctionArguments<typeof factory>
export type FactoryReturn = FunctionReturn<typeof factory>

/** fee() */
export const fee = func('0xddca3f43', {}, uint24)
export type FeeParams = FunctionArguments<typeof fee>
export type FeeReturn = FunctionReturn<typeof fee>

/** feeGrowthGlobal0X128() */
export const feeGrowthGlobal0X128 = func('0xf3058399', {}, uint256)
export type FeeGrowthGlobal0X128Params = FunctionArguments<typeof feeGrowthGlobal0X128>
export type FeeGrowthGlobal0X128Return = FunctionReturn<typeof feeGrowthGlobal0X128>

/** feeGrowthGlobal1X128() */
export const feeGrowthGlobal1X128 = func('0x46141319', {}, uint256)
export type FeeGrowthGlobal1X128Params = FunctionArguments<typeof feeGrowthGlobal1X128>
export type FeeGrowthGlobal1X128Return = FunctionReturn<typeof feeGrowthGlobal1X128>

/** flash(address,uint256,uint256,bytes) */
export const flash = func('0x490e6cbc', {
    recipient: address,
    amount0: uint256,
    amount1: uint256,
    data: bytes,
})
export type FlashParams = FunctionArguments<typeof flash>
export type FlashReturn = FunctionReturn<typeof flash>

/** increaseObservationCardinalityNext(uint16) */
export const increaseObservationCardinalityNext = func('0x32148f67', {
    observationCardinalityNext: uint16,
})
export type IncreaseObservationCardinalityNextParams = FunctionArguments<typeof increaseObservationCardinalityNext>
export type IncreaseObservationCardinalityNextReturn = FunctionReturn<typeof increaseObservationCardinalityNext>

/** initialize(uint160) */
export const initialize = func('0xf637731d', {
    sqrtPriceX96: uint160,
})
export type InitializeParams = FunctionArguments<typeof initialize>
export type InitializeReturn = FunctionReturn<typeof initialize>

/** liquidity() */
export const liquidity = func('0x1a686502', {}, uint128)
export type LiquidityParams = FunctionArguments<typeof liquidity>
export type LiquidityReturn = FunctionReturn<typeof liquidity>

/** maxLiquidityPerTick() */
export const maxLiquidityPerTick = func('0x70cf754a', {}, uint128)
export type MaxLiquidityPerTickParams = FunctionArguments<typeof maxLiquidityPerTick>
export type MaxLiquidityPerTickReturn = FunctionReturn<typeof maxLiquidityPerTick>

/** mint(address,int24,int24,uint128,bytes) */
export const mint = func('0x3c8a7d8d', {
    recipient: address,
    tickLower: int24,
    tickUpper: int24,
    amount: uint128,
    data: bytes,
}, struct({
    amount0: uint256,
    amount1: uint256,
}))
export type MintParams = FunctionArguments<typeof mint>
export type MintReturn = FunctionReturn<typeof mint>

/** observations(uint256) */
export const observations = func('0x252c09d7', {
    index: uint256,
}, struct({
    blockTimestamp: uint32,
    tickCumulative: int56,
    secondsPerLiquidityCumulativeX128: uint160,
    initialized: bool,
}))
export type ObservationsParams = FunctionArguments<typeof observations>
export type ObservationsReturn = FunctionReturn<typeof observations>

/** observe(uint32[]) */
export const observe = func('0x883bdbfd', {
    secondsAgos: array(uint32),
}, struct({
    tickCumulatives: array(int56),
    secondsPerLiquidityCumulativeX128s: array(uint160),
}))
export type ObserveParams = FunctionArguments<typeof observe>
export type ObserveReturn = FunctionReturn<typeof observe>

/** positions(bytes32) */
export const positions = func('0x514ea4bf', {
    key: bytes32,
}, struct({
    _liquidity: uint128,
    feeGrowthInside0LastX128: uint256,
    feeGrowthInside1LastX128: uint256,
    tokensOwed0: uint128,
    tokensOwed1: uint128,
}))
export type PositionsParams = FunctionArguments<typeof positions>
export type PositionsReturn = FunctionReturn<typeof positions>

/** protocolFees() */
export const protocolFees = func('0x1ad8b03b', {}, struct({
    token0: uint128,
    token1: uint128,
}))
export type ProtocolFeesParams = FunctionArguments<typeof protocolFees>
export type ProtocolFeesReturn = FunctionReturn<typeof protocolFees>

/** setFeeProtocol(uint8,uint8) */
export const setFeeProtocol = func('0x8206a4d1', {
    feeProtocol0: uint8,
    feeProtocol1: uint8,
})
export type SetFeeProtocolParams = FunctionArguments<typeof setFeeProtocol>
export type SetFeeProtocolReturn = FunctionReturn<typeof setFeeProtocol>

/** slot0() */
export const slot0 = func('0x3850c7bd', {}, struct({
    sqrtPriceX96: uint160,
    tick: int24,
    observationIndex: uint16,
    observationCardinality: uint16,
    observationCardinalityNext: uint16,
    feeProtocol: uint8,
    unlocked: bool,
}))
export type Slot0Params = FunctionArguments<typeof slot0>
export type Slot0Return = FunctionReturn<typeof slot0>

/** snapshotCumulativesInside(int24,int24) */
export const snapshotCumulativesInside = func('0xa38807f2', {
    tickLower: int24,
    tickUpper: int24,
}, struct({
    tickCumulativeInside: int56,
    secondsPerLiquidityInsideX128: uint160,
    secondsInside: uint32,
}))
export type SnapshotCumulativesInsideParams = FunctionArguments<typeof snapshotCumulativesInside>
export type SnapshotCumulativesInsideReturn = FunctionReturn<typeof snapshotCumulativesInside>

/** swap(address,bool,int256,uint160,bytes) */
export const swap = func('0x128acb08', {
    recipient: address,
    zeroForOne: bool,
    amountSpecified: int256,
    sqrtPriceLimitX96: uint160,
    data: bytes,
}, struct({
    amount0: int256,
    amount1: int256,
}))
export type SwapParams = FunctionArguments<typeof swap>
export type SwapReturn = FunctionReturn<typeof swap>

/** tickBitmap(int16) */
export const tickBitmap = func('0x5339c296', {
    wordPosition: int16,
}, uint256)
export type TickBitmapParams = FunctionArguments<typeof tickBitmap>
export type TickBitmapReturn = FunctionReturn<typeof tickBitmap>

/** tickSpacing() */
export const tickSpacing = func('0xd0c93a7c', {}, int24)
export type TickSpacingParams = FunctionArguments<typeof tickSpacing>
export type TickSpacingReturn = FunctionReturn<typeof tickSpacing>

/** ticks(int24) */
export const ticks = func('0xf30dba93', {
    tick: int24,
}, struct({
    liquidityGross: uint128,
    liquidityNet: int128,
    feeGrowthOutside0X128: uint256,
    feeGrowthOutside1X128: uint256,
    tickCumulativeOutside: int56,
    secondsPerLiquidityOutsideX128: uint160,
    secondsOutside: uint32,
    initialized: bool,
}))
export type TicksParams = FunctionArguments<typeof ticks>
export type TicksReturn = FunctionReturn<typeof ticks>

/** token0() */
export const token0 = func('0x0dfe1681', {}, address)
export type Token0Params = FunctionArguments<typeof token0>
export type Token0Return = FunctionReturn<typeof token0>

/** token1() */
export const token1 = func('0xd21220a7', {}, address)
export type Token1Params = FunctionArguments<typeof token1>
export type Token1Return = FunctionReturn<typeof token1>
