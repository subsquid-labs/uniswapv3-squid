import * as ethers from 'ethers'
import {LogEvent, Func, ContractBase} from './abi.support'
import {ABI_JSON} from './pool.abi'

export const abi = new ethers.Interface(ABI_JSON);

export const events = {
    Burn: new LogEvent<([owner: string, tickLower: number, tickUpper: number, amount: bigint, amount0: bigint, amount1: bigint] & {owner: string, tickLower: number, tickUpper: number, amount: bigint, amount0: bigint, amount1: bigint})>(
        abi, '0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c'
    ),
    Collect: new LogEvent<([owner: string, recipient: string, tickLower: number, tickUpper: number, amount0: bigint, amount1: bigint] & {owner: string, recipient: string, tickLower: number, tickUpper: number, amount0: bigint, amount1: bigint})>(
        abi, '0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0'
    ),
    CollectProtocol: new LogEvent<([sender: string, recipient: string, amount0: bigint, amount1: bigint] & {sender: string, recipient: string, amount0: bigint, amount1: bigint})>(
        abi, '0x596b573906218d3411850b26a6b437d6c4522fdb43d2d2386263f86d50b8b151'
    ),
    Flash: new LogEvent<([sender: string, recipient: string, amount0: bigint, amount1: bigint, paid0: bigint, paid1: bigint] & {sender: string, recipient: string, amount0: bigint, amount1: bigint, paid0: bigint, paid1: bigint})>(
        abi, '0xbdbdb71d7860376ba52b25a5028beea23581364a40522f6bcfb86bb1f2dca633'
    ),
    IncreaseObservationCardinalityNext: new LogEvent<([observationCardinalityNextOld: number, observationCardinalityNextNew: number] & {observationCardinalityNextOld: number, observationCardinalityNextNew: number})>(
        abi, '0xac49e518f90a358f652e4400164f05a5d8f7e35e7747279bc3a93dbf584e125a'
    ),
    Initialize: new LogEvent<([sqrtPriceX96: bigint, tick: number] & {sqrtPriceX96: bigint, tick: number})>(
        abi, '0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95'
    ),
    Mint: new LogEvent<([sender: string, owner: string, tickLower: number, tickUpper: number, amount: bigint, amount0: bigint, amount1: bigint] & {sender: string, owner: string, tickLower: number, tickUpper: number, amount: bigint, amount0: bigint, amount1: bigint})>(
        abi, '0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde'
    ),
    SetFeeProtocol: new LogEvent<([feeProtocol0Old: number, feeProtocol1Old: number, feeProtocol0New: number, feeProtocol1New: number] & {feeProtocol0Old: number, feeProtocol1Old: number, feeProtocol0New: number, feeProtocol1New: number})>(
        abi, '0x973d8d92bb299f4af6ce49b52a8adb85ae46b9f214c4c4fc06ac77401237b133'
    ),
    Swap: new LogEvent<([sender: string, recipient: string, amount0: bigint, amount1: bigint, sqrtPriceX96: bigint, liquidity: bigint, tick: number] & {sender: string, recipient: string, amount0: bigint, amount1: bigint, sqrtPriceX96: bigint, liquidity: bigint, tick: number})>(
        abi, '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'
    ),
}

export const functions = {
    burn: new Func<[tickLower: number, tickUpper: number, amount: bigint], {tickLower: number, tickUpper: number, amount: bigint}, ([amount0: bigint, amount1: bigint] & {amount0: bigint, amount1: bigint})>(
        abi, '0xa34123a7'
    ),
    collect: new Func<[recipient: string, tickLower: number, tickUpper: number, amount0Requested: bigint, amount1Requested: bigint], {recipient: string, tickLower: number, tickUpper: number, amount0Requested: bigint, amount1Requested: bigint}, ([amount0: bigint, amount1: bigint] & {amount0: bigint, amount1: bigint})>(
        abi, '0x4f1eb3d8'
    ),
    collectProtocol: new Func<[recipient: string, amount0Requested: bigint, amount1Requested: bigint], {recipient: string, amount0Requested: bigint, amount1Requested: bigint}, ([amount0: bigint, amount1: bigint] & {amount0: bigint, amount1: bigint})>(
        abi, '0x85b66729'
    ),
    factory: new Func<[], {}, string>(
        abi, '0xc45a0155'
    ),
    fee: new Func<[], {}, number>(
        abi, '0xddca3f43'
    ),
    feeGrowthGlobal0X128: new Func<[], {}, bigint>(
        abi, '0xf3058399'
    ),
    feeGrowthGlobal1X128: new Func<[], {}, bigint>(
        abi, '0x46141319'
    ),
    flash: new Func<[recipient: string, amount0: bigint, amount1: bigint, data: string], {recipient: string, amount0: bigint, amount1: bigint, data: string}, []>(
        abi, '0x490e6cbc'
    ),
    increaseObservationCardinalityNext: new Func<[observationCardinalityNext: number], {observationCardinalityNext: number}, []>(
        abi, '0x32148f67'
    ),
    initialize: new Func<[sqrtPriceX96: bigint], {sqrtPriceX96: bigint}, []>(
        abi, '0xf637731d'
    ),
    liquidity: new Func<[], {}, bigint>(
        abi, '0x1a686502'
    ),
    maxLiquidityPerTick: new Func<[], {}, bigint>(
        abi, '0x70cf754a'
    ),
    mint: new Func<[recipient: string, tickLower: number, tickUpper: number, amount: bigint, data: string], {recipient: string, tickLower: number, tickUpper: number, amount: bigint, data: string}, ([amount0: bigint, amount1: bigint] & {amount0: bigint, amount1: bigint})>(
        abi, '0x3c8a7d8d'
    ),
    observations: new Func<[index: bigint], {index: bigint}, ([blockTimestamp: number, tickCumulative: bigint, secondsPerLiquidityCumulativeX128: bigint, initialized: boolean] & {blockTimestamp: number, tickCumulative: bigint, secondsPerLiquidityCumulativeX128: bigint, initialized: boolean})>(
        abi, '0x252c09d7'
    ),
    observe: new Func<[secondsAgos: Array<number>], {secondsAgos: Array<number>}, ([tickCumulatives: Array<bigint>, secondsPerLiquidityCumulativeX128s: Array<bigint>] & {tickCumulatives: Array<bigint>, secondsPerLiquidityCumulativeX128s: Array<bigint>})>(
        abi, '0x883bdbfd'
    ),
    positions: new Func<[key: string], {key: string}, ([_liquidity: bigint, feeGrowthInside0LastX128: bigint, feeGrowthInside1LastX128: bigint, tokensOwed0: bigint, tokensOwed1: bigint] & {_liquidity: bigint, feeGrowthInside0LastX128: bigint, feeGrowthInside1LastX128: bigint, tokensOwed0: bigint, tokensOwed1: bigint})>(
        abi, '0x514ea4bf'
    ),
    protocolFees: new Func<[], {}, ([token0: bigint, token1: bigint] & {token0: bigint, token1: bigint})>(
        abi, '0x1ad8b03b'
    ),
    setFeeProtocol: new Func<[feeProtocol0: number, feeProtocol1: number], {feeProtocol0: number, feeProtocol1: number}, []>(
        abi, '0x8206a4d1'
    ),
    slot0: new Func<[], {}, ([sqrtPriceX96: bigint, tick: number, observationIndex: number, observationCardinality: number, observationCardinalityNext: number, feeProtocol: number, unlocked: boolean] & {sqrtPriceX96: bigint, tick: number, observationIndex: number, observationCardinality: number, observationCardinalityNext: number, feeProtocol: number, unlocked: boolean})>(
        abi, '0x3850c7bd'
    ),
    snapshotCumulativesInside: new Func<[tickLower: number, tickUpper: number], {tickLower: number, tickUpper: number}, ([tickCumulativeInside: bigint, secondsPerLiquidityInsideX128: bigint, secondsInside: number] & {tickCumulativeInside: bigint, secondsPerLiquidityInsideX128: bigint, secondsInside: number})>(
        abi, '0xa38807f2'
    ),
    swap: new Func<[recipient: string, zeroForOne: boolean, amountSpecified: bigint, sqrtPriceLimitX96: bigint, data: string], {recipient: string, zeroForOne: boolean, amountSpecified: bigint, sqrtPriceLimitX96: bigint, data: string}, ([amount0: bigint, amount1: bigint] & {amount0: bigint, amount1: bigint})>(
        abi, '0x128acb08'
    ),
    tickBitmap: new Func<[wordPosition: number], {wordPosition: number}, bigint>(
        abi, '0x5339c296'
    ),
    tickSpacing: new Func<[], {}, number>(
        abi, '0xd0c93a7c'
    ),
    ticks: new Func<[tick: number], {tick: number}, ([liquidityGross: bigint, liquidityNet: bigint, feeGrowthOutside0X128: bigint, feeGrowthOutside1X128: bigint, tickCumulativeOutside: bigint, secondsPerLiquidityOutsideX128: bigint, secondsOutside: number, initialized: boolean] & {liquidityGross: bigint, liquidityNet: bigint, feeGrowthOutside0X128: bigint, feeGrowthOutside1X128: bigint, tickCumulativeOutside: bigint, secondsPerLiquidityOutsideX128: bigint, secondsOutside: number, initialized: boolean})>(
        abi, '0xf30dba93'
    ),
    token0: new Func<[], {}, string>(
        abi, '0x0dfe1681'
    ),
    token1: new Func<[], {}, string>(
        abi, '0xd21220a7'
    ),
}

export class Contract extends ContractBase {

    factory(): Promise<string> {
        return this.eth_call(functions.factory, [])
    }

    fee(): Promise<number> {
        return this.eth_call(functions.fee, [])
    }

    feeGrowthGlobal0X128(): Promise<bigint> {
        return this.eth_call(functions.feeGrowthGlobal0X128, [])
    }

    feeGrowthGlobal1X128(): Promise<bigint> {
        return this.eth_call(functions.feeGrowthGlobal1X128, [])
    }

    liquidity(): Promise<bigint> {
        return this.eth_call(functions.liquidity, [])
    }

    maxLiquidityPerTick(): Promise<bigint> {
        return this.eth_call(functions.maxLiquidityPerTick, [])
    }

    observations(index: bigint): Promise<([blockTimestamp: number, tickCumulative: bigint, secondsPerLiquidityCumulativeX128: bigint, initialized: boolean] & {blockTimestamp: number, tickCumulative: bigint, secondsPerLiquidityCumulativeX128: bigint, initialized: boolean})> {
        return this.eth_call(functions.observations, [index])
    }

    observe(secondsAgos: Array<number>): Promise<([tickCumulatives: Array<bigint>, secondsPerLiquidityCumulativeX128s: Array<bigint>] & {tickCumulatives: Array<bigint>, secondsPerLiquidityCumulativeX128s: Array<bigint>})> {
        return this.eth_call(functions.observe, [secondsAgos])
    }

    positions(key: string): Promise<([_liquidity: bigint, feeGrowthInside0LastX128: bigint, feeGrowthInside1LastX128: bigint, tokensOwed0: bigint, tokensOwed1: bigint] & {_liquidity: bigint, feeGrowthInside0LastX128: bigint, feeGrowthInside1LastX128: bigint, tokensOwed0: bigint, tokensOwed1: bigint})> {
        return this.eth_call(functions.positions, [key])
    }

    protocolFees(): Promise<([token0: bigint, token1: bigint] & {token0: bigint, token1: bigint})> {
        return this.eth_call(functions.protocolFees, [])
    }

    slot0(): Promise<([sqrtPriceX96: bigint, tick: number, observationIndex: number, observationCardinality: number, observationCardinalityNext: number, feeProtocol: number, unlocked: boolean] & {sqrtPriceX96: bigint, tick: number, observationIndex: number, observationCardinality: number, observationCardinalityNext: number, feeProtocol: number, unlocked: boolean})> {
        return this.eth_call(functions.slot0, [])
    }

    snapshotCumulativesInside(tickLower: number, tickUpper: number): Promise<([tickCumulativeInside: bigint, secondsPerLiquidityInsideX128: bigint, secondsInside: number] & {tickCumulativeInside: bigint, secondsPerLiquidityInsideX128: bigint, secondsInside: number})> {
        return this.eth_call(functions.snapshotCumulativesInside, [tickLower, tickUpper])
    }

    tickBitmap(wordPosition: number): Promise<bigint> {
        return this.eth_call(functions.tickBitmap, [wordPosition])
    }

    tickSpacing(): Promise<number> {
        return this.eth_call(functions.tickSpacing, [])
    }

    ticks(tick: number): Promise<([liquidityGross: bigint, liquidityNet: bigint, feeGrowthOutside0X128: bigint, feeGrowthOutside1X128: bigint, tickCumulativeOutside: bigint, secondsPerLiquidityOutsideX128: bigint, secondsOutside: number, initialized: boolean] & {liquidityGross: bigint, liquidityNet: bigint, feeGrowthOutside0X128: bigint, feeGrowthOutside1X128: bigint, tickCumulativeOutside: bigint, secondsPerLiquidityOutsideX128: bigint, secondsOutside: number, initialized: boolean})> {
        return this.eth_call(functions.ticks, [tick])
    }

    token0(): Promise<string> {
        return this.eth_call(functions.token0, [])
    }

    token1(): Promise<string> {
        return this.eth_call(functions.token1, [])
    }
}
