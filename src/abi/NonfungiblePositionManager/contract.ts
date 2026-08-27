import { ContractBase } from '../abi.support.js'
import { DOMAIN_SEPARATOR, PERMIT_TYPEHASH, WETH9, balanceOf, baseURI, collect, createAndInitializePoolIfNecessary, decreaseLiquidity, factory, getApproved, increaseLiquidity, isApprovedForAll, mint, multicall, name, ownerOf, positions, supportsInterface, symbol, tokenByIndex, tokenOfOwnerByIndex, tokenURI, totalSupply } from './functions.js'
import type { BalanceOfParams, CollectParams, CreateAndInitializePoolIfNecessaryParams, DecreaseLiquidityParams, GetApprovedParams, IncreaseLiquidityParams, IsApprovedForAllParams, MintParams, MulticallParams, OwnerOfParams, PositionsParams, SupportsInterfaceParams, TokenByIndexParams, TokenOfOwnerByIndexParams, TokenURIParams } from './functions.js'

export class Contract extends ContractBase {
    DOMAIN_SEPARATOR() {
        return this.eth_call(DOMAIN_SEPARATOR, {})
    }

    PERMIT_TYPEHASH() {
        return this.eth_call(PERMIT_TYPEHASH, {})
    }

    WETH9() {
        return this.eth_call(WETH9, {})
    }

    balanceOf(owner: BalanceOfParams["owner"]) {
        return this.eth_call(balanceOf, {owner})
    }

    baseURI() {
        return this.eth_call(baseURI, {})
    }

    collect(tokenId: CollectParams["tokenId"], recipient: CollectParams["recipient"], amount0Max: CollectParams["amount0Max"], amount1Max: CollectParams["amount1Max"]) {
        return this.eth_call(collect, {tokenId, recipient, amount0Max, amount1Max})
    }

    createAndInitializePoolIfNecessary(tokenA: CreateAndInitializePoolIfNecessaryParams["tokenA"], tokenB: CreateAndInitializePoolIfNecessaryParams["tokenB"], fee: CreateAndInitializePoolIfNecessaryParams["fee"], sqrtPriceX96: CreateAndInitializePoolIfNecessaryParams["sqrtPriceX96"]) {
        return this.eth_call(createAndInitializePoolIfNecessary, {tokenA, tokenB, fee, sqrtPriceX96})
    }

    decreaseLiquidity(tokenId: DecreaseLiquidityParams["tokenId"], liquidity: DecreaseLiquidityParams["liquidity"], amount0Min: DecreaseLiquidityParams["amount0Min"], amount1Min: DecreaseLiquidityParams["amount1Min"], deadline: DecreaseLiquidityParams["deadline"]) {
        return this.eth_call(decreaseLiquidity, {tokenId, liquidity, amount0Min, amount1Min, deadline})
    }

    factory() {
        return this.eth_call(factory, {})
    }

    getApproved(tokenId: GetApprovedParams["tokenId"]) {
        return this.eth_call(getApproved, {tokenId})
    }

    increaseLiquidity(tokenId: IncreaseLiquidityParams["tokenId"], amount0Desired: IncreaseLiquidityParams["amount0Desired"], amount1Desired: IncreaseLiquidityParams["amount1Desired"], amount0Min: IncreaseLiquidityParams["amount0Min"], amount1Min: IncreaseLiquidityParams["amount1Min"], deadline: IncreaseLiquidityParams["deadline"]) {
        return this.eth_call(increaseLiquidity, {tokenId, amount0Desired, amount1Desired, amount0Min, amount1Min, deadline})
    }

    isApprovedForAll(owner: IsApprovedForAllParams["owner"], operator: IsApprovedForAllParams["operator"]) {
        return this.eth_call(isApprovedForAll, {owner, operator})
    }

    mint(params: MintParams["params"]) {
        return this.eth_call(mint, {params})
    }

    multicall(data: MulticallParams["data"]) {
        return this.eth_call(multicall, {data})
    }

    name() {
        return this.eth_call(name, {})
    }

    ownerOf(tokenId: OwnerOfParams["tokenId"]) {
        return this.eth_call(ownerOf, {tokenId})
    }

    positions(tokenId: PositionsParams["tokenId"]) {
        return this.eth_call(positions, {tokenId})
    }

    supportsInterface(interfaceId: SupportsInterfaceParams["interfaceId"]) {
        return this.eth_call(supportsInterface, {interfaceId})
    }

    symbol() {
        return this.eth_call(symbol, {})
    }

    tokenByIndex(index: TokenByIndexParams["index"]) {
        return this.eth_call(tokenByIndex, {index})
    }

    tokenOfOwnerByIndex(owner: TokenOfOwnerByIndexParams["owner"], index: TokenOfOwnerByIndexParams["index"]) {
        return this.eth_call(tokenOfOwnerByIndex, {owner, index})
    }

    tokenURI(tokenId: TokenURIParams["tokenId"]) {
        return this.eth_call(tokenURI, {tokenId})
    }

    totalSupply() {
        return this.eth_call(totalSupply, {})
    }
}
