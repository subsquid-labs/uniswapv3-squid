import { address, array, bool, bytes, bytes32, bytes4, int24, string, struct, uint128, uint160, uint24, uint256, uint8, uint96 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** DOMAIN_SEPARATOR() */
export const DOMAIN_SEPARATOR = func('0x3644e515', {}, bytes32)
export type DOMAIN_SEPARATORParams = FunctionArguments<typeof DOMAIN_SEPARATOR>
export type DOMAIN_SEPARATORReturn = FunctionReturn<typeof DOMAIN_SEPARATOR>

/** PERMIT_TYPEHASH() */
export const PERMIT_TYPEHASH = func('0x30adf81f', {}, bytes32)
export type PERMIT_TYPEHASHParams = FunctionArguments<typeof PERMIT_TYPEHASH>
export type PERMIT_TYPEHASHReturn = FunctionReturn<typeof PERMIT_TYPEHASH>

/** WETH9() */
export const WETH9 = func('0x4aa4a4fc', {}, address)
export type WETH9Params = FunctionArguments<typeof WETH9>
export type WETH9Return = FunctionReturn<typeof WETH9>

/** approve(address,uint256) */
export const approve = func('0x095ea7b3', {
    to: address,
    tokenId: uint256,
})
export type ApproveParams = FunctionArguments<typeof approve>
export type ApproveReturn = FunctionReturn<typeof approve>

/** balanceOf(address) */
export const balanceOf = func('0x70a08231', {
    owner: address,
}, uint256)
export type BalanceOfParams = FunctionArguments<typeof balanceOf>
export type BalanceOfReturn = FunctionReturn<typeof balanceOf>

/** baseURI() */
export const baseURI = func('0x6c0360eb', {}, string)
export type BaseURIParams = FunctionArguments<typeof baseURI>
export type BaseURIReturn = FunctionReturn<typeof baseURI>

/** burn(uint256) */
export const burn = func('0x42966c68', {
    tokenId: uint256,
})
export type BurnParams = FunctionArguments<typeof burn>
export type BurnReturn = FunctionReturn<typeof burn>

/** collect(uint256,address,uint128,uint128) */
export const collect = func('0x260e12b0', {
    tokenId: uint256,
    recipient: address,
    amount0Max: uint128,
    amount1Max: uint128,
}, struct({
    amount0: uint256,
    amount1: uint256,
}))
export type CollectParams = FunctionArguments<typeof collect>
export type CollectReturn = FunctionReturn<typeof collect>

/** createAndInitializePoolIfNecessary(address,address,uint24,uint160) */
export const createAndInitializePoolIfNecessary = func('0x13ead562', {
    tokenA: address,
    tokenB: address,
    fee: uint24,
    sqrtPriceX96: uint160,
}, address)
export type CreateAndInitializePoolIfNecessaryParams = FunctionArguments<typeof createAndInitializePoolIfNecessary>
export type CreateAndInitializePoolIfNecessaryReturn = FunctionReturn<typeof createAndInitializePoolIfNecessary>

/** decreaseLiquidity(uint256,uint128,uint256,uint256,uint256) */
export const decreaseLiquidity = func('0x03a3f2ab', {
    tokenId: uint256,
    liquidity: uint128,
    amount0Min: uint256,
    amount1Min: uint256,
    deadline: uint256,
}, struct({
    amount0: uint256,
    amount1: uint256,
}))
export type DecreaseLiquidityParams = FunctionArguments<typeof decreaseLiquidity>
export type DecreaseLiquidityReturn = FunctionReturn<typeof decreaseLiquidity>

/** factory() */
export const factory = func('0xc45a0155', {}, address)
export type FactoryParams = FunctionArguments<typeof factory>
export type FactoryReturn = FunctionReturn<typeof factory>

/** getApproved(uint256) */
export const getApproved = func('0x081812fc', {
    tokenId: uint256,
}, address)
export type GetApprovedParams = FunctionArguments<typeof getApproved>
export type GetApprovedReturn = FunctionReturn<typeof getApproved>

/** increaseLiquidity(uint256,uint256,uint256,uint256,uint256,uint256) */
export const increaseLiquidity = func('0x12d7b2c4', {
    tokenId: uint256,
    amount0Desired: uint256,
    amount1Desired: uint256,
    amount0Min: uint256,
    amount1Min: uint256,
    deadline: uint256,
}, struct({
    liquidity: uint128,
    amount0: uint256,
    amount1: uint256,
}))
export type IncreaseLiquidityParams = FunctionArguments<typeof increaseLiquidity>
export type IncreaseLiquidityReturn = FunctionReturn<typeof increaseLiquidity>

/** isApprovedForAll(address,address) */
export const isApprovedForAll = func('0xe985e9c5', {
    owner: address,
    operator: address,
}, bool)
export type IsApprovedForAllParams = FunctionArguments<typeof isApprovedForAll>
export type IsApprovedForAllReturn = FunctionReturn<typeof isApprovedForAll>

/** mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) */
export const mint = func('0x88316456', {
    params: struct({
        token0: address,
        token1: address,
        fee: uint24,
        tickLower: int24,
        tickUpper: int24,
        amount0Desired: uint256,
        amount1Desired: uint256,
        amount0Min: uint256,
        amount1Min: uint256,
        recipient: address,
        deadline: uint256,
    }),
}, struct({
    tokenId: uint256,
    liquidity: uint128,
    amount0: uint256,
    amount1: uint256,
}))
export type MintParams = FunctionArguments<typeof mint>
export type MintReturn = FunctionReturn<typeof mint>

/** multicall(bytes[]) */
export const multicall = func('0xac9650d8', {
    data: array(bytes),
}, array(bytes))
export type MulticallParams = FunctionArguments<typeof multicall>
export type MulticallReturn = FunctionReturn<typeof multicall>

/** name() */
export const name = func('0x06fdde03', {}, string)
export type NameParams = FunctionArguments<typeof name>
export type NameReturn = FunctionReturn<typeof name>

/** ownerOf(uint256) */
export const ownerOf = func('0x6352211e', {
    tokenId: uint256,
}, address)
export type OwnerOfParams = FunctionArguments<typeof ownerOf>
export type OwnerOfReturn = FunctionReturn<typeof ownerOf>

/** permit(address,uint256,uint256,uint8,bytes32,bytes32) */
export const permit = func('0x7ac2ff7b', {
    spender: address,
    tokenId: uint256,
    deadline: uint256,
    v: uint8,
    r: bytes32,
    s: bytes32,
})
export type PermitParams = FunctionArguments<typeof permit>
export type PermitReturn = FunctionReturn<typeof permit>

/** positions(uint256) */
export const positions = func('0x99fbab88', {
    tokenId: uint256,
}, struct({
    nonce: uint96,
    operator: address,
    token0: address,
    token1: address,
    fee: uint24,
    tickLower: int24,
    tickUpper: int24,
    liquidity: uint128,
    feeGrowthInside0LastX128: uint256,
    feeGrowthInside1LastX128: uint256,
    tokensOwed0: uint128,
    tokensOwed1: uint128,
}))
export type PositionsParams = FunctionArguments<typeof positions>
export type PositionsReturn = FunctionReturn<typeof positions>

/** safeTransferFrom(address,address,uint256) */
export const safeTransferFrom = func('0x42842e0e', {
    from: address,
    to: address,
    tokenId: uint256,
})
export type SafeTransferFromParams = FunctionArguments<typeof safeTransferFrom>
export type SafeTransferFromReturn = FunctionReturn<typeof safeTransferFrom>

/** safeTransferFrom(address,address,uint256,bytes) */
export const safeTransferFrom_1 = func('0xb88d4fde', {
    from: address,
    to: address,
    tokenId: uint256,
    _data: bytes,
})
export type SafeTransferFromParams_1 = FunctionArguments<typeof safeTransferFrom_1>
export type SafeTransferFromReturn_1 = FunctionReturn<typeof safeTransferFrom_1>

/** selfPermit(address,uint256,uint256,uint8,bytes32,bytes32) */
export const selfPermit = func('0xf3995c67', {
    token: address,
    value: uint256,
    deadline: uint256,
    v: uint8,
    r: bytes32,
    s: bytes32,
})
export type SelfPermitParams = FunctionArguments<typeof selfPermit>
export type SelfPermitReturn = FunctionReturn<typeof selfPermit>

/** selfPermitAllowed(address,uint256,uint256,uint8,bytes32,bytes32) */
export const selfPermitAllowed = func('0x4659a494', {
    token: address,
    nonce: uint256,
    expiry: uint256,
    v: uint8,
    r: bytes32,
    s: bytes32,
})
export type SelfPermitAllowedParams = FunctionArguments<typeof selfPermitAllowed>
export type SelfPermitAllowedReturn = FunctionReturn<typeof selfPermitAllowed>

/** selfPermitAllowedIfNecessary(address,uint256,uint256,uint8,bytes32,bytes32) */
export const selfPermitAllowedIfNecessary = func('0xa4a78f0c', {
    token: address,
    nonce: uint256,
    expiry: uint256,
    v: uint8,
    r: bytes32,
    s: bytes32,
})
export type SelfPermitAllowedIfNecessaryParams = FunctionArguments<typeof selfPermitAllowedIfNecessary>
export type SelfPermitAllowedIfNecessaryReturn = FunctionReturn<typeof selfPermitAllowedIfNecessary>

/** selfPermitIfNecessary(address,uint256,uint256,uint8,bytes32,bytes32) */
export const selfPermitIfNecessary = func('0xc2e3140a', {
    token: address,
    value: uint256,
    deadline: uint256,
    v: uint8,
    r: bytes32,
    s: bytes32,
})
export type SelfPermitIfNecessaryParams = FunctionArguments<typeof selfPermitIfNecessary>
export type SelfPermitIfNecessaryReturn = FunctionReturn<typeof selfPermitIfNecessary>

/** setApprovalForAll(address,bool) */
export const setApprovalForAll = func('0xa22cb465', {
    operator: address,
    approved: bool,
})
export type SetApprovalForAllParams = FunctionArguments<typeof setApprovalForAll>
export type SetApprovalForAllReturn = FunctionReturn<typeof setApprovalForAll>

/** supportsInterface(bytes4) */
export const supportsInterface = func('0x01ffc9a7', {
    interfaceId: bytes4,
}, bool)
export type SupportsInterfaceParams = FunctionArguments<typeof supportsInterface>
export type SupportsInterfaceReturn = FunctionReturn<typeof supportsInterface>

/** sweepToken(address,uint256,address) */
export const sweepToken = func('0xdf2ab5bb', {
    token: address,
    amountMinimum: uint256,
    recipient: address,
})
export type SweepTokenParams = FunctionArguments<typeof sweepToken>
export type SweepTokenReturn = FunctionReturn<typeof sweepToken>

/** symbol() */
export const symbol = func('0x95d89b41', {}, string)
export type SymbolParams = FunctionArguments<typeof symbol>
export type SymbolReturn = FunctionReturn<typeof symbol>

/** tokenByIndex(uint256) */
export const tokenByIndex = func('0x4f6ccce7', {
    index: uint256,
}, uint256)
export type TokenByIndexParams = FunctionArguments<typeof tokenByIndex>
export type TokenByIndexReturn = FunctionReturn<typeof tokenByIndex>

/** tokenOfOwnerByIndex(address,uint256) */
export const tokenOfOwnerByIndex = func('0x2f745c59', {
    owner: address,
    index: uint256,
}, uint256)
export type TokenOfOwnerByIndexParams = FunctionArguments<typeof tokenOfOwnerByIndex>
export type TokenOfOwnerByIndexReturn = FunctionReturn<typeof tokenOfOwnerByIndex>

/** tokenURI(uint256) */
export const tokenURI = func('0xc87b56dd', {
    tokenId: uint256,
}, string)
export type TokenURIParams = FunctionArguments<typeof tokenURI>
export type TokenURIReturn = FunctionReturn<typeof tokenURI>

/** totalSupply() */
export const totalSupply = func('0x18160ddd', {}, uint256)
export type TotalSupplyParams = FunctionArguments<typeof totalSupply>
export type TotalSupplyReturn = FunctionReturn<typeof totalSupply>

/** transferFrom(address,address,uint256) */
export const transferFrom = func('0x23b872dd', {
    from: address,
    to: address,
    tokenId: uint256,
})
export type TransferFromParams = FunctionArguments<typeof transferFrom>
export type TransferFromReturn = FunctionReturn<typeof transferFrom>

/** uniswapV3MintCallback(uint256,uint256,bytes) */
export const uniswapV3MintCallback = func('0xd3487997', {
    amount0Owed: uint256,
    amount1Owed: uint256,
    data: bytes,
})
export type UniswapV3MintCallbackParams = FunctionArguments<typeof uniswapV3MintCallback>
export type UniswapV3MintCallbackReturn = FunctionReturn<typeof uniswapV3MintCallback>

/** unwrapWETH9(uint256,address) */
export const unwrapWETH9 = func('0x49404b7c', {
    amountMinimum: uint256,
    recipient: address,
})
export type UnwrapWETH9Params = FunctionArguments<typeof unwrapWETH9>
export type UnwrapWETH9Return = FunctionReturn<typeof unwrapWETH9>
