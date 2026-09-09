import 'dotenv/config'
import { hd } from '@ckb-lumos/lumos'
import ScriptIdentityService from '../../src/services/script-identities'
import ScriptIdentity from '../../src/models/script-identity'
import ScriptIdentityEntity from '../../src/database/chain/entities/script-identity'
import HdPublicKeyInfo from '../../src/database/chain/entities/hd-public-key-info'
import Script, { ScriptHashType } from '../../src/models/chain/script'
import { closeConnection, getConnection, initConnection } from '../setupAndTeardown'

const WALLET = 'wallet-a'
const OTHER_WALLET = 'wallet-b'
const PROVIDER = 'slh-dsa-fips205'
const CODE_HASH = `0x${'a1'.repeat(32)}`

const identity = (overrides: Partial<ConstructorParameters<typeof ScriptIdentity>[0]> = {}) =>
  ScriptIdentity.fromObject({
    walletId: WALLET,
    providerId: PROVIDER,
    addressType: hd.AddressType.Receiving,
    addressIndex: 0,
    address: 'ckt1qqqqqqqqqqqqqqqqqqqqqq',
    lockCodeHash: CODE_HASH,
    lockHashType: ScriptHashType.Data1,
    lockArgs: `0x${'11'.repeat(32)}`,
    derivationPath: null,
    publicKey: `0x${'22'.repeat(32)}`,
    metadata: { parameterSet: 'SLH-DSA-SHA2-256s' },
    ...overrides,
  })

describe('ScriptIdentity model', () => {
  it('builds the full lock script from its stored parts', () => {
    const script = identity().lockScript()

    expect(script.codeHash).toBe(CODE_HASH)
    expect(script.hashType).toBe(ScriptHashType.Data1)
    expect(script.args).toBe(`0x${'11'.repeat(32)}`)
  })

  it('computes a lock hash that matches the equivalent Script', () => {
    const expected = new Script(CODE_HASH, `0x${'11'.repeat(32)}`, ScriptHashType.Data1).computeHash()

    expect(identity().lockHash()).toBe(expected)
  })

  it('treats an identity with no derivation path as watch only', () => {
    expect(identity({ derivationPath: null }).isWatchOnly()).toBe(true)
  })

  it('treats an identity with a derivation path as spendable', () => {
    expect(identity({ derivationPath: `m/44'/309'/0'/0/0` }).isWatchOnly()).toBe(false)
  })

  it('does not force a public key, so an address-only identity can be tracked', () => {
    expect(identity({ publicKey: null }).publicKey).toBeNull()
  })
})

describe('ScriptIdentityService', () => {
  beforeAll(async () => {
    await initConnection()
  })

  afterAll(async () => {
    await closeConnection()
  })

  beforeEach(async () => {
    await getConnection().createQueryBuilder().delete().from(ScriptIdentityEntity).execute()
    await getConnection().createQueryBuilder().delete().from(HdPublicKeyInfo).execute()
  })

  it('persists an identity and reads it back unchanged', async () => {
    await ScriptIdentityService.save([identity()])

    const [stored] = await ScriptIdentityService.getByWalletId(WALLET)

    expect(stored.providerId).toBe(PROVIDER)
    expect(stored.lockCodeHash).toBe(CODE_HASH)
    expect(stored.lockHashType).toBe(ScriptHashType.Data1)
    expect(stored.lockArgs).toBe(`0x${'11'.repeat(32)}`)
    expect(stored.addressIndex).toBe(0)
  })

  it('round trips provider metadata, which is not recoverable from the script', async () => {
    // An SLH-DSA lock's args are a hash, so the parameter set cannot be derived back out of the
    // script. If metadata does not survive persistence, a restored wallet cannot size a witness or
    // build a signature.
    await ScriptIdentityService.save([identity()])

    const [stored] = await ScriptIdentityService.getByWalletId(WALLET)

    expect(stored.metadata).toEqual({ parameterSet: 'SLH-DSA-SHA2-256s' })
  })

  it('keeps identities of different wallets apart', async () => {
    await ScriptIdentityService.save([identity(), identity({ walletId: OTHER_WALLET })])

    expect(await ScriptIdentityService.getByWalletId(WALLET)).toHaveLength(1)
    expect(await ScriptIdentityService.getByWalletId(OTHER_WALLET)).toHaveLength(1)
  })

  it('does not store the same lock twice for one wallet', async () => {
    await ScriptIdentityService.save([identity()])
    await ScriptIdentityService.save([identity({ address: 'ckt1re-derived-differently' })])

    expect(await ScriptIdentityService.getByWalletId(WALLET)).toHaveLength(1)
  })

  it('finds an identity by its full lock script', async () => {
    await ScriptIdentityService.save([identity()])

    const found = await ScriptIdentityService.getByLockScript(
      new Script(CODE_HASH, `0x${'11'.repeat(32)}`, ScriptHashType.Data1)
    )

    expect(found?.walletId).toBe(WALLET)
  })

  it('does not find an identity when only the hash type differs', async () => {
    await ScriptIdentityService.save([identity()])

    const found = await ScriptIdentityService.getByLockScript(
      new Script(CODE_HASH, `0x${'11'.repeat(32)}`, ScriptHashType.Type)
    )

    expect(found).toBeUndefined()
  })

  it('lists the lock scripts a wallet needs watched', async () => {
    await ScriptIdentityService.save([identity(), identity({ addressIndex: 1, lockArgs: `0x${'33'.repeat(32)}` })])

    const scripts = await ScriptIdentityService.getLockScriptsByWalletId(WALLET)

    expect(scripts.map(s => s.args).sort()).toEqual([`0x${'11'.repeat(32)}`, `0x${'33'.repeat(32)}`])
  })

  it('removes only the deleted wallet identities', async () => {
    await ScriptIdentityService.save([identity(), identity({ walletId: OTHER_WALLET })])

    await ScriptIdentityService.deleteByWalletId(WALLET)

    expect(await ScriptIdentityService.getByWalletId(WALLET)).toHaveLength(0)
    expect(await ScriptIdentityService.getByWalletId(OTHER_WALLET)).toHaveLength(1)
  })

  it('enforces one row per wallet and lock at the database level, not only in the service', async () => {
    // Two guards protect this: the service checks before inserting, and the migration adds a unique
    // constraint. Tested separately so that removing either one is visible.
    await ScriptIdentityService.save([identity()])

    const duplicate = ScriptIdentityEntity.fromModel(identity({ address: 'ckt1different' }))

    await expect(getConnection().manager.save(duplicate)).rejects.toThrow(/unique/i)
  })

  it('allows the same lock args under a different code hash', async () => {
    await ScriptIdentityService.save([identity(), identity({ lockCodeHash: `0x${'b2'.repeat(32)}` })])

    expect(await ScriptIdentityService.getByWalletId(WALLET)).toHaveLength(2)
  })

  it('leaves legacy HD key info untouched', async () => {
    // The whole point of a separate table: opening a build that has this feature must not rewrite,
    // migrate or disturb the identities of existing secp wallets.
    const legacy = HdPublicKeyInfo.fromObject({
      walletId: WALLET,
      addressType: hd.AddressType.Receiving,
      addressIndex: 0,
      publicKeyInBlake160: `0x${'44'.repeat(20)}`,
    })
    await getConnection().manager.save(legacy)

    await ScriptIdentityService.save([identity()])
    await ScriptIdentityService.deleteByWalletId(WALLET)

    const legacyRows = await getConnection()
      .getRepository(HdPublicKeyInfo)
      .find({ where: { walletId: WALLET } })
    expect(legacyRows).toHaveLength(1)
    expect(legacyRows[0].publicKeyInBlake160).toBe(`0x${'44'.repeat(20)}`)
  })
})
