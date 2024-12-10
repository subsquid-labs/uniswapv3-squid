/* eslint-disable prefer-const */

export const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
export const USDC_WETH_03_POOL = "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8";

// token where amounts should contribute to tracked volume and liquidity
// usually tokens that many tokens are paired with s
export let WHITELIST_TOKENS: string[] = [
  WETH_ADDRESS, // WETH
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  "0x0000000000085d4780b73119b644ae5ecd22b376", // TUSD
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
  "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643", // cDAI
  "0x39aa39c021dfbae8fac545936693ac917d5e7563", // cUSDC
  "0x86fadb80d8d2cff3c3680819e4da99c10232ba0f", // EBASE
  "0x57ab1ec28d129707052df4df418d58a2d46d5f51", // sUSD
  "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2", // MKR
  "0xc00e94cb662c3520282e6f5717214004a7f26888", // COMP
  "0x514910771af9ca656af840dff83e8264ecf986ca", // LINK
  "0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f", // SNX
  "0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e", // YFI
  "0x111111111117dc0aa78b770fa6a738034120c302", // 1INCH
  "0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8", // yCurv
  "0x956f47f50a910163d8bf957cf5846d573e7f87ca", // FEI
  "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0", // MATIC
  "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", // AAVE
  "0xfe2e637202056d30016725477c5da089ab0a043a", // sETH2
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", // UNI
];

export let STABLE_COINS: string[] = [
  "0x6b175474e89094c44da98b954eedeac495271d0f",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0xdac17f958d2ee523a2206206994597c13d831ec7",
  "0x0000000000085d4780b73119b644ae5ecd22b376",
  "0x956f47f50a910163d8bf957cf5846d573e7f87ca",
  "0x4dd28568d05f09b02220b09c2cb307bfd837cb95",
];

export let MINIMUM_ETH_LOCKED = 60;

let Q192 = 2 ** 192;
export function sqrtPriceX96ToTokenPrices(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number,
  poolAddress: string,
  token0Symbol: string,
  token1Symbol: string,
  timestamp: string
): number[] {
  // Validate inputs
  if (!sqrtPriceX96) {
    return [0, 0];
  }

  if (sqrtPriceX96 <= 0n) {
    return [0, 0];
  }

  if (decimals0 < 0 || decimals1 < 0) {
    return [0, 0];
  }

  try {
    // Convert sqrtPriceX96 to number safely
    const sqrtPriceFloat = Number(sqrtPriceX96);
    if (!isFinite(sqrtPriceFloat)) {
      throw new Error('sqrtPrice conversion to float resulted in non-finite number');
    }

    // Calculate square of price with decimal adjustment
    const price = sqrtPriceFloat * sqrtPriceFloat * Math.pow(10, decimals0 - decimals1) / Number(1n << 192n);

    // Validate calculated price
    if (!isFinite(price) || price <= 0) {
      throw new Error('Invalid price calculation result');
    }

    const price0 = 1 / price;
    const price1 = price;

    // Validate final prices
    if (!isFinite(price0) || !isFinite(price1) || price0 <= 0 || price1 <= 0) {
      throw new Error('Invalid final price values');
    }
    
    return [price0, price1];
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Price calculation failed for pool ${poolAddress}: ${error}`);
    console.error(`Input values: sqrtPriceX96=${sqrtPriceX96}, decimals0=${decimals0}, decimals1=${decimals1}`);

    return [0, 0];
  }
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedAmountUSD(
  token0: string,
  amount0USD: number,
  token1: string,
  amount1USD: number
): number {
  // Convert addresses to lowercase for comparison
  const t0 = token0.toLowerCase();
  const t1 = token1.toLowerCase();
  const whitelist = WHITELIST_TOKENS.map(t => t.toLowerCase());

  // both are whitelist tokens, return sum of both amounts
  if (whitelist.includes(t0) && whitelist.includes(t1)) {
    return (amount0USD + amount1USD) / 2;
  }

  // take value of the whitelisted token amount
  if (whitelist.includes(t0) && !whitelist.includes(t1)) {
    return amount0USD;
  }

  // take value of the whitelisted token amount
  if (!whitelist.includes(t0) && whitelist.includes(t1)) {
    return amount1USD;
  }

  // neither token is on white list, tracked amount is 0
  return 0;
}
