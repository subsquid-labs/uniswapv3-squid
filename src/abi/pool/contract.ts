import { ContractBase } from '../abi.support.js'
import { burn, collect, collectProtocol, factory, fee, feeGrowthGlobal0X128, feeGrowthGlobal1X128, liquidity, maxLiquidityPerTick, mint, observations, observe, positions, protocolFees, slot0, snapshotCumulativesInside, swap, tickBitmap, tickSpacing, ticks, token0, token1 } from './functions.js'
import type { BurnParams, CollectParams, CollectProtocolParams, MintParams, ObservationsParams, ObserveParams, PositionsParams, SnapshotCumulativesInsideParams, SwapParams, TickBitmapParams, TicksParams } from './functions.js'

export class Contract extends ContractBase {
    burn(tickLower: BurnParams["tickLower"], tickUpper: BurnParams["tickUpper"], amount: BurnParams["amount"]) {
        return this.eth_call(burn, {tickLower, tickUpper, amount})
    }

    collect(recipient: CollectParams["recipient"], tickLower: CollectParams["tickLower"], tickUpper: CollectParams["tickUpper"], amount0Requested: CollectParams["amount0Requested"], amount1Requested: CollectParams["amount1Requested"]) {
        return this.eth_call(collect, {recipient, tickLower, tickUpper, amount0Requested, amount1Requested})
    }

    collectProtocol(recipient: CollectProtocolParams["recipient"], amount0Requested: CollectProtocolParams["amount0Requested"], amount1Requested: CollectProtocolParams["amount1Requested"]) {
        return this.eth_call(collectProtocol, {recipient, amount0Requested, amount1Requested})
    }

    factory() {
        return this.eth_call(factory, {})
    }

    fee() {
        return this.eth_call(fee, {})
    }

    feeGrowthGlobal0X128() {
        return this.eth_call(feeGrowthGlobal0X128, {})
    }

    feeGrowthGlobal1X128() {
        return this.eth_call(feeGrowthGlobal1X128, {})
    }

    liquidity() {
        return this.eth_call(liquidity, {})
    }

    maxLiquidityPerTick() {
        return this.eth_call(maxLiquidityPerTick, {})
    }

    mint(recipient: MintParams["recipient"], tickLower: MintParams["tickLower"], tickUpper: MintParams["tickUpper"], amount: MintParams["amount"], data: MintParams["data"]) {
        return this.eth_call(mint, {recipient, tickLower, tickUpper, amount, data})
    }

    observations(index: ObservationsParams["index"]) {
        return this.eth_call(observations, {index})
    }

    observe(secondsAgos: ObserveParams["secondsAgos"]) {
        return this.eth_call(observe, {secondsAgos})
    }

    positions(key: PositionsParams["key"]) {
        return this.eth_call(positions, {key})
    }

    protocolFees() {
        return this.eth_call(protocolFees, {})
    }

    slot0() {
        return this.eth_call(slot0, {})
    }

    snapshotCumulativesInside(tickLower: SnapshotCumulativesInsideParams["tickLower"], tickUpper: SnapshotCumulativesInsideParams["tickUpper"]) {
        return this.eth_call(snapshotCumulativesInside, {tickLower, tickUpper})
    }

    swap(recipient: SwapParams["recipient"], zeroForOne: SwapParams["zeroForOne"], amountSpecified: SwapParams["amountSpecified"], sqrtPriceLimitX96: SwapParams["sqrtPriceLimitX96"], data: SwapParams["data"]) {
        return this.eth_call(swap, {recipient, zeroForOne, amountSpecified, sqrtPriceLimitX96, data})
    }

    tickBitmap(wordPosition: TickBitmapParams["wordPosition"]) {
        return this.eth_call(tickBitmap, {wordPosition})
    }

    tickSpacing() {
        return this.eth_call(tickSpacing, {})
    }

    ticks(tick: TicksParams["tick"]) {
        return this.eth_call(ticks, {tick})
    }

    token0() {
        return this.eth_call(token0, {})
    }

    token1() {
        return this.eth_call(token1, {})
    }
}
