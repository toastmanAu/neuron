/**
 * The structural invariant for externally funded Fiber channels.
 *
 * Fiber's `open_channel_with_external_funding` returns a transaction whose structure both peers
 * have already agreed on. From that point the external signer may fill in the witnesses for the
 * cells it contributed and nothing else: `inputs`, `outputs`, `outputs_data`, `cell_deps`,
 * `header_deps` and `version` are frozen. Rebuilding the transaction — even into something that
 * looks equivalent — breaks the negotiation.
 *
 * This is enforced rather than trusted. A snapshot is taken of everything except the witnesses, and
 * checked again immediately before submission, so a bug anywhere between the two points is caught
 * here instead of by the peer.
 */

export class FundingStructureChanged extends Error {
  constructor(detail: string) {
    super(
      `The negotiated funding transaction structure changed before submission (${detail}). ` +
        'Only witnesses may be filled in; inputs, outputs, outputs data, cell deps, header deps and version are frozen.'
    )
  }
}

/** A funding transaction in the JSON-RPC shape a Fiber node uses. */
export interface FundingTransactionJson {
  version: string
  cell_deps: unknown[]
  header_deps: unknown[]
  inputs: unknown[]
  outputs: unknown[]
  outputs_data: string[]
  witnesses: string[]
  [field: string]: unknown
}

/**
 * Normalise a hex quantity so that equal values compare equal.
 *
 * A JSON round trip through different libraries can turn `0x0` into `0x00`; that is not a
 * structural change and must not be reported as one. Anything that is not a hex quantity is left
 * alone.
 */
const normaliseHex = (value: string): string => {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    return value
  }
  const digits = value.slice(2).replace(/^0+/, '')
  // Preserve byte strings (even length, and longer than a quantity would be) as-is, lowercased:
  // 0x0011 as script args is not the same thing as the quantity 0x11.
  if (value.length > 18) {
    return value.toLowerCase()
  }
  return `0x${digits === '' ? '0' : digits.toLowerCase()}`
}

/** Canonical JSON: keys sorted, hex quantities normalised, witnesses omitted. */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonical)
  }
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' ? normaliseHex(value) : value
  }
  const record = value as Record<string, unknown>
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((out, key) => {
      out[key] = canonical(record[key])
      return out
    }, {})
}

export interface FundingStructure {
  /** Canonical serialisation of every frozen field. */
  readonly digest: string
  /** Witness count is part of the structure: it is tied to the input count. */
  readonly witnessCount: number
  readonly fields: Readonly<Record<string, string>>
}

const FROZEN_FIELDS = ['version', 'cell_deps', 'header_deps', 'inputs', 'outputs', 'outputs_data'] as const

export const structuralSnapshot = (tx: FundingTransactionJson): string => {
  return JSON.stringify(
    canonical(
      FROZEN_FIELDS.reduce<Record<string, unknown>>((out, field) => {
        out[field] = tx[field]
        return out
      }, {})
    )
  )
}

/** Per-field snapshot, so a mismatch can name what moved instead of only that something did. */
export const structuralFields = (tx: FundingTransactionJson): Record<string, string> =>
  FROZEN_FIELDS.reduce<Record<string, string>>((out, field) => {
    out[field] = JSON.stringify(canonical(tx[field]))
    return out
  }, {})

export const snapshotFundingStructure = (tx: FundingTransactionJson): FundingStructure => ({
  digest: structuralSnapshot(tx),
  witnessCount: tx.witnesses.length,
  fields: structuralFields(tx),
})

/**
 * Throw unless `after` differs from the snapshot only in its witness contents.
 *
 * Takes the full snapshot rather than a bare digest on purpose: the witness *count* is part of the
 * structure, because it is tied to the input count, and a digest alone cannot carry it. An earlier
 * revision accepted either and silently skipped the count check when given a digest.
 */
export const assertOnlyWitnessesChanged = (before: FundingStructure, after: FundingTransactionJson): void => {
  const afterFields = structuralFields(after)
  const changed = FROZEN_FIELDS.filter(field => before.fields[field] !== afterFields[field])
  if (changed.length > 0) {
    throw new FundingStructureChanged(`${changed.join(', ')} changed`)
  }

  if (after.witnesses.length !== before.witnessCount) {
    throw new FundingStructureChanged(`witness count changed from ${before.witnessCount} to ${after.witnesses.length}`)
  }
}
