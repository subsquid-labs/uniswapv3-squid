import { bytes32 } from '@subsquid/evm-codec'
import { func } from '../abi.support.js'
import type { FunctionArguments, FunctionReturn } from '../abi.support.js'

/** name() */
export const name = func('0x06fdde03', {}, bytes32)
export type NameParams = FunctionArguments<typeof name>
export type NameReturn = FunctionReturn<typeof name>
