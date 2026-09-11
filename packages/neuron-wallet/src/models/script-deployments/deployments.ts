import { ScriptHashType } from '../chain/script'
import { DepType } from '../chain/cell-dep'
import { ScriptDeployment } from './types'

/**
 * Lock provider id for the Nervos FIPS 205 (SLH-DSA / SPHINCS+) all-in-one lock.
 *
 * Declared here rather than with the provider so that deployment data and provider code can land in
 * separate changes without either importing the other. The provider must use this exact string.
 */
export const SLH_DSA_PROVIDER_ID = 'slh-dsa-fips205'

const QUANTUM_RESISTANT_LOCK_SOURCE =
  'https://github.com/nervosnetwork/quantum-resistant-lock-script/tree/082c0a19ce4e0b2c0b00f7b46f423f59a30afc71'

/**
 * Externally deployed scripts bundled with this build.
 *
 * Every value here was read from the publishing project and is asserted against those literals in
 * `tests/models/script-deployments/index.test.ts`. If upstream redeploys, change both together.
 *
 * Note the deliberate asymmetry between networks: mainnet is `type` (a Type ID, so the code behind
 * it is upgradeable by upstream's 3-of-5 multisig) while testnet is `data1` (pinned to the binary).
 * That is upstream's choice, not a transcription error.
 */
export const BUNDLED_SCRIPT_DEPLOYMENTS: readonly ScriptDeployment[] = [
  {
    id: `${SLH_DSA_PROVIDER_ID}/mainnet`,
    providerId: SLH_DSA_PROVIDER_ID,
    network: 'mainnet',
    codeHash: '0x302d35982f865ebcbedb9a9360e40530ed32adb8e10b42fbbe70d8312ff7cedf',
    hashType: ScriptHashType.Type,
    cellDep: {
      txHash: '0x4598d00df2f3dc8bc40eee38689a539c94f6cc3720b7a2a6746736daa60f500a',
      index: '0x0',
      depType: DepType.Code,
    },
    verifiedBinaryHash: '0x49417a0ed39196e8d90d0088ca98bf6b881966ba1c2ea12160ca42141787565e',
    status: 'verified',
    source: QUANTUM_RESISTANT_LOCK_SOURCE,
  },
  {
    id: `${SLH_DSA_PROVIDER_ID}/testnet`,
    providerId: SLH_DSA_PROVIDER_ID,
    network: 'testnet',
    codeHash: '0x147ecbb5c5127d982ee1362d2c2bb4267803da2eb006d150e88af6caaa0a7eaf',
    hashType: ScriptHashType.Data1,
    cellDep: {
      txHash: '0x631d9a6049fb1fc3790e89d9daf35abe535b5e754cd8c3404319319710f0b106',
      index: '0x0',
      depType: DepType.Code,
    },
    verifiedBinaryHash: '0x147ecbb5c5127d982ee1362d2c2bb4267803da2eb006d150e88af6caaa0a7eaf',
    status: 'verified',
    source: QUANTUM_RESISTANT_LOCK_SOURCE,
  },
]
