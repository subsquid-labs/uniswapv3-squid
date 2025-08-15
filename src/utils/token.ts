import { DataHandlerContext, BlockData } from "@subsquid/evm-processor";
import { BlockHandlerContext } from "./interfaces/interfaces";
import * as ERC20 from "../abi/ERC20";
import * as ERC20NameBytes from "../abi/ERC20NameBytes";
import * as ERC20SymbolBytes from "../abi/ERC20SymbolBytes";
import { Multicall } from "../abi/multicall";
import { MULTICALL_ADDRESS } from "./constants";
import { StaticTokenDefinition } from "./staticTokenDefinition";
import { removeNullBytes } from "./tools";
import { Store } from "@subsquid/typeorm-store";

export async function fetchTokensSymbol(
  ctx: BlockHandlerContext<Store>,
  tokenAddresses: string[]
) {
  const symbols = new Map<string, string>();

  if (!MULTICALL_ADDRESS) {
    // Fallback: fetch symbols individually
    for (const address of tokenAddresses) {
      try {
        const erc20 = new ERC20.Contract(ctx, address);
        const symbol = await erc20.symbol();
        symbols.set(address, removeNullBytes(symbol));
      } catch {
        try {
          const erc20Bytes = new ERC20SymbolBytes.Contract(ctx, address);
          const symbol = await erc20Bytes.symbol();
          symbols.set(address, removeNullBytes(symbol));
        } catch {
          const value = StaticTokenDefinition.fromAddress(address)?.symbol;
          if (value == null) ctx.log.warn(`Missing symbol for token ${address}`);
          symbols.set(address, value || "unknown");
        }
      }
    }
    return symbols;
  }

  const multicall = new Multicall(ctx, MULTICALL_ADDRESS!);

  const results = await multicall.tryAggregate(
    ERC20.functions.symbol,
    tokenAddresses.map((a) => [a, {}])
  );

  results.forEach((res, i) => {
    const address = tokenAddresses[i];
    let sym: string | undefined;
    if (res.success) {
      sym = String(res.value);
    } else if (res.returnData) {
      sym = ERC20SymbolBytes.functions.symbol.decodeResult(res.returnData);
    }
    if (sym) {
      symbols.set(address, removeNullBytes(sym));
    } else {
      const value = StaticTokenDefinition.fromAddress(address)?.symbol;
      if (value == null) ctx.log.warn(`Missing symbol for token ${address}`);
      symbols.set(address, value || "unknown");
    }
  });

  return symbols;
}

export async function fetchTokensName(
  ctx: BlockHandlerContext<Store>,
  tokenAddresses: string[]
) {
  const names = new Map<string, string>();

  if (!MULTICALL_ADDRESS) {
    // Fallback: fetch names individually
    for (const address of tokenAddresses) {
      try {
        const erc20 = new ERC20.Contract(ctx, address);
        const name = await erc20.name();
        names.set(address, removeNullBytes(name));
      } catch {
        try {
          const erc20Bytes = new ERC20NameBytes.Contract(ctx, address);
          const name = await erc20Bytes.name();
          names.set(address, removeNullBytes(name));
        } catch {
          const value = StaticTokenDefinition.fromAddress(address)?.name;
          if (value == null) ctx.log.warn(`Missing name for token ${address}`);
          names.set(address, value || "unknown");
        }
      }
    }
    return names;
  }

  const multicall = new Multicall(ctx, MULTICALL_ADDRESS!);

  const results = await multicall.tryAggregate(
    ERC20.functions.name,
    tokenAddresses.map((a) => [a, {}])
  );

  results.forEach((res, i) => {
    const address = tokenAddresses[i];
    let name: string | undefined;
    if (res.success) {
      name = String(res.value);
    } else if (res.returnData) {
      name = ERC20NameBytes.functions.name.decodeResult(res.returnData);
    }
    if (name) {
      names.set(address, removeNullBytes(name));
    } else {
      const value = StaticTokenDefinition.fromAddress(address)?.name;
      if (value == null) ctx.log.warn(`Missing name for token ${address}`);
      names.set(address, value || "unknown");
    }
  });

  return names;
}

export async function fetchTokensTotalSupply(
  ctx: BlockHandlerContext<Store>,
  tokenAddresses: string[]
) {
  if (!MULTICALL_ADDRESS) {
    // Fallback: fetch total supply individually
    const results = new Map<string, bigint>();
    for (const address of tokenAddresses) {
      try {
        const erc20 = new ERC20.Contract(ctx, address);
        const supply = await erc20.totalSupply();
        results.set(address, supply);
      } catch {
        results.set(address, 0n);
      }
    }
    return results;
  }

  let multicall = new Multicall(ctx, MULTICALL_ADDRESS!);

  let results = await multicall.tryAggregate(
    ERC20.functions.totalSupply,
    tokenAddresses.map((a) => [a, {}])
  );

  return new Map(
    results.map((res, i) => {
      let address = tokenAddresses[i];
      let supply = res.success ? BigInt(res.value) : 0n;
      return [address, supply];
    })
  );
}

export async function fetchTokensDecimals(
  ctx: BlockHandlerContext<Store>,
  tokenAddresses: string[]
) {
  if (!MULTICALL_ADDRESS) {
    // Fallback: fetch decimals individually
    const results = new Map<string, number>();
    for (const address of tokenAddresses) {
      try {
        const erc20 = new ERC20.Contract(ctx, address);
        const decimals = await erc20.decimals();
        results.set(address, decimals);
      } catch {
        results.set(address, 0);
      }
    }
    return results;
  }

  let multicall = new Multicall(ctx, MULTICALL_ADDRESS!);

  let results = await multicall.tryAggregate(
    ERC20.functions.decimals,
    tokenAddresses.map((a) => [a, {}])
  );

  return new Map(
    results.map((res, i) => {
      i = Number(i);
      let address = tokenAddresses[i];
      let decimals = res.success ? res.value : 0;
      return [address, decimals];
    })
  );
}
