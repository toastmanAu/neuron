import Transaction from '../../models/chain/transaction'
import { deepCamelizeKeys } from '../../utils/deep-camelize-keys'
import Script from '../../models/chain/script'
import { ResolvedInput } from '../../models/ckb-tx-message-all'
import { Network } from '../../models/network'
import { generateRPC } from '../../utils/ckb-rpc'

/**
 * Fetch the cell each input spends, for locks whose signing message commits to input contents.
 *
 * Resolved from the node, not from Neuron's own index, on purpose: the transaction persistor stores
 * only the first 65 bytes of a cell's data (`output.data = data.slice(0, 130)`). The FIPS 205 lock
 * hashes the whole of it, so a locally-resolved input would produce a signature that is wrong for
 * any cell carrying more data than that — and wrong in a way that only shows up when the chain
 * rejects the transaction.
 *
 * secp sighash-all does not need any of this; it signs the transaction hash alone.
 *
 * When `context` is supplied it is used first. Neuron already writes the full previous transaction
 * of every input into an exported offline-signing file, so an offline signer can resolve inputs
 * from that file alone and does not need a node — which is what makes offline signing possible for
 * these locks at all, without changing the export format.
 */

interface CamelPreviousTransaction {
  outputs: CKBComponents.CellOutput[]
  outputsData: string[]
}

/**
 * Index the supplied previous transactions by their own hash.
 *
 * The exported context carries raw transactions with no hash field, so each one is hashed the same
 * way the transaction itself is, and matched against the outpoints being spent.
 */
const indexContext = (context?: RPC.RawTransaction[]): Map<string, CamelPreviousTransaction> => {
  const index = new Map<string, CamelPreviousTransaction>()
  context?.forEach(raw => {
    const camel = deepCamelizeKeys(raw) as CKBComponents.RawTransaction
    try {
      index.set(Transaction.fromSDK(camel).computeHash(), {
        outputs: camel.outputs,
        outputsData: camel.outputsData,
      })
    } catch {
      // An entry we cannot hash is simply not usable for matching; the node fallback still applies.
    }
  })
  return index
}

const resolveFromContext = (
  previous: CamelPreviousTransaction,
  outPoint: CKBComponents.OutPoint,
  index: number,
  expectedLock?: Script
): ResolvedInput => {
  const outputIndex = Number(outPoint.index)
  const output = previous.outputs[outputIndex]
  if (!output) {
    throw new Error(
      `Input ${index} refers to output ${outPoint.index} of ${outPoint.txHash}, which that transaction does not have`
    )
  }

  const lock = Script.fromSDK(output.lock)
  if (expectedLock && expectedLock.computeHash() !== lock.computeHash()) {
    throw new Error(
      `Input ${index} is guarded by a different lock in the supplied context than the transaction expects`
    )
  }

  return {
    capacity: output.capacity,
    lock,
    type: output.type ? Script.fromSDK(output.type) : null,
    data: previous.outputsData[outputIndex] ?? '0x',
  }
}

const resolveInputsForSigning = async (
  tx: Transaction,
  network: Network,
  context?: RPC.RawTransaction[]
): Promise<ResolvedInput[]> => {
  const rpc = generateRPC(network.remote, network.type)
  const contextByHash = indexContext(context)

  const resolved: ResolvedInput[] = []
  for (const [index, input] of tx.inputs.entries()) {
    if (!input.previousOutput) {
      throw new Error(`Input ${index} has no previous output, so the cell it spends cannot be resolved`)
    }

    const outPoint = input.previousOutput.toSDK()

    const fromContext = contextByHash.get(outPoint.txHash)
    if (fromContext) {
      resolved.push(resolveFromContext(fromContext, outPoint, index, input.lock ?? undefined))
      continue
    }

    const liveCell = await rpc.getLiveCell(outPoint, true)

    if (!liveCell || liveCell.status !== 'live' || !liveCell.cell) {
      throw new Error(
        `Cannot resolve input ${index} (${outPoint.txHash}:${outPoint.index}): the node does not report it as a live cell`
      )
    }

    const output = liveCell.cell.output
    const lock = Script.fromSDK(output.lock)

    // The transaction was built against some view of the chain; if the cell we are about to commit
    // to is not the one the builder selected, stop rather than sign over a different cell.
    if (input.lock && input.lock.computeHash() !== lock.computeHash()) {
      throw new Error(
        `Input ${index} (${outPoint.txHash}:${outPoint.index}) is guarded by a different lock on chain than the transaction expects`
      )
    }

    resolved.push({
      capacity: output.capacity,
      lock,
      type: output.type ? Script.fromSDK(output.type) : null,
      data: liveCell.cell.data?.content ?? '0x',
    })
  }

  return resolved
}

export default resolveInputsForSigning
