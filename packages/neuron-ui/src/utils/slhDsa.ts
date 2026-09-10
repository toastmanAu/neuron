/**
 * Presentation helpers for SLH-DSA parameter sets.
 *
 * The backend reports the facts — key and signature sizes, and whether a set is slow to sign. This
 * turns them into the two things a user actually chooses between: how large every transaction
 * becomes, and how long signing takes.
 */

/**
 * The set offered by default.
 *
 * SHA2-256s: the strongest security level, the smaller signature of the two 256-bit variants, and
 * the lowest on-chain verification cost. It signs in about three seconds, which is noticeable but
 * tolerable; the SHAKE sets take four to five times longer for no security gain in this context.
 */
export const RECOMMENDED_PARAMETER_SET = 'SLH-DSA-SHA2-256s'

export interface ParameterSetDescription {
  /** 128, 192 or 256, read from the name rather than inferred from a size. */
  securityBits: number
  /** `f` variants sign fast and verify slowly; `s` variants the reverse. */
  fastSigning: boolean
  signatureKb: number
  witnessKb: number
  /** True when signing is slow enough that the UI should say so before the user commits. */
  warnSlow: boolean
}

export const isAdvancedParameterSet = (name: string): boolean => name !== RECOMMENDED_PARAMETER_SET

export const describeParameterSet = (set: Controller.SlhDsaParameterSetSummary): ParameterSetDescription => {
  const match = set.name.match(/-(128|192|256)(f|s)$/)
  return {
    securityBits: match ? Number(match[1]) : 0,
    fastSigning: match?.[2] === 'f',
    signatureKb: set.signatureLength / 1024,
    witnessKb: set.witnessSize / 1024,
    warnSlow: set.slowSigning,
  }
}

/**
 * Split the sets into the one offered by default and the rest.
 *
 * Every set stays reachable — the choice is real, not hidden — but only one is put in front of
 * someone who has no reason to care.
 */
export const groupParameterSets = (
  sets: readonly Controller.SlhDsaParameterSetSummary[]
): { recommended: Controller.SlhDsaParameterSetSummary; advanced: Controller.SlhDsaParameterSetSummary[] } => {
  const recommended = sets.find(s => s.name === RECOMMENDED_PARAMETER_SET) ?? sets[0]
  return { recommended, advanced: sets.filter(s => s.name !== recommended.name) }
}

/** Bytes a secp256k1 witness occupies, for comparison. */
const SECP_WITNESS_BYTES = 93

export const formatWitnessCost = (witnessSize: number, options: { comparedToSecp?: boolean } = {}): string => {
  const kb = `${(witnessSize / 1024).toFixed(1)} KB`
  if (!options.comparedToSecp) {
    return kb
  }
  return `${kb} (about ${Math.round(witnessSize / SECP_WITNESS_BYTES)}x a secp256k1 witness)`
}
