import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn, Unique } from 'typeorm'
import { hd } from '@ckb-lumos/lumos'
import ScriptIdentityModel from '../../../models/script-identity'
import { ScriptHashType } from '../../../models/chain/script'

/**
 * Persisted identity for a provider-backed (non legacy HD secp) address.
 *
 * `hd_public_key_info` is deliberately left alone: it is blake160 shaped and every reader of it
 * rebuilds a secp script from that column.
 */
@Entity()
@Unique(['walletId', 'lockCodeHash', 'lockHashType', 'lockArgs'])
export default class ScriptIdentity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar' })
  @Index()
  walletId!: string

  @Column({ type: 'varchar' })
  @Index()
  providerId!: string

  @Column()
  addressType!: hd.AddressType

  @Column()
  addressIndex!: number

  @Column({ type: 'varchar' })
  address!: string

  @Column({ type: 'varchar' })
  lockCodeHash!: string

  @Column({ type: 'varchar' })
  lockHashType!: ScriptHashType

  @Column({ type: 'varchar' })
  lockArgs!: string

  @Column({ type: 'varchar', nullable: true })
  derivationPath!: string | null

  @Column({ type: 'varchar', nullable: true })
  publicKey!: string | null

  /** JSON encoded provider metadata; see ScriptIdentityModel.metadata. */
  @Column({ type: 'varchar', nullable: true })
  metadata!: string | null

  @Column({ type: 'varchar', nullable: true })
  description!: string | null

  @CreateDateColumn({
    type: 'varchar',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date

  public static fromModel(model: ScriptIdentityModel): ScriptIdentity {
    const entity = new ScriptIdentity()

    entity.walletId = model.walletId
    entity.providerId = model.providerId
    entity.addressType = model.addressType
    entity.addressIndex = model.addressIndex
    entity.address = model.address
    entity.lockCodeHash = model.lockCodeHash
    entity.lockHashType = model.lockHashType
    entity.lockArgs = model.lockArgs
    entity.derivationPath = model.derivationPath
    entity.publicKey = model.publicKey
    entity.metadata = model.metadata === null ? null : JSON.stringify(model.metadata)
    entity.description = model.description

    return entity
  }

  public toModel(): ScriptIdentityModel {
    return ScriptIdentityModel.fromObject({
      walletId: this.walletId,
      providerId: this.providerId,
      addressType: this.addressType,
      addressIndex: this.addressIndex,
      address: this.address,
      lockCodeHash: this.lockCodeHash,
      lockHashType: this.lockHashType,
      lockArgs: this.lockArgs,
      derivationPath: this.derivationPath,
      publicKey: this.publicKey,
      metadata: this.metadata === null ? null : JSON.parse(this.metadata),
      description: this.description,
    })
  }
}
