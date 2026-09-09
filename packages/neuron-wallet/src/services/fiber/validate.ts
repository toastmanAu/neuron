import { ScriptHashType } from '../../models/chain/script'
import { FiberScript } from './types'

/**
 * Shape checks for Fiber RPC responses.
 *
 * A Fiber endpoint is a URL the user typed. It can be a proxy, the wrong port, an older node, or a
 * different daemon entirely, so nothing that comes back is trusted to have the shape its method
 * name implies. These raise with the field that was wrong, because "undefined is not an object"
 * three layers later is not a diagnosis.
 */

export class FiberResponseError extends Error {
  constructor(method: string, detail: string) {
    super(`Fiber node returned an unexpected ${method} response: ${detail}`)
  }
}

export const asRecord = (value: unknown, method: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FiberResponseError(method, 'expected an object')
  }
  return value as Record<string, unknown>
}

export const requireString = (record: Record<string, unknown>, field: string, method: string): string => {
  const value = record[field]
  if (typeof value !== 'string') {
    throw new FiberResponseError(method, `missing or non-string field "${field}"`)
  }
  return value
}

export const optionalString = (record: Record<string, unknown>, field: string): string | undefined =>
  typeof record[field] === 'string' ? (record[field] as string) : undefined

export const requireBoolean = (record: Record<string, unknown>, field: string, method: string): boolean => {
  const value = record[field]
  if (typeof value !== 'boolean') {
    throw new FiberResponseError(method, `missing or non-boolean field "${field}"`)
  }
  return value
}

export const requireArray = (record: Record<string, unknown>, field: string, method: string): unknown[] => {
  const value = record[field]
  if (!Array.isArray(value)) {
    throw new FiberResponseError(method, `missing or non-array field "${field}"`)
  }
  return value
}

export const toScript = (value: unknown, method: string): FiberScript | null => {
  if (value === null || value === undefined) {
    return null
  }
  const record = asRecord(value, method)
  return {
    codeHash: requireString(record, 'code_hash', method),
    hashType: requireString(record, 'hash_type', method) as ScriptHashType,
    args: requireString(record, 'args', method),
  }
}
