import { MigrationInterface, QueryRunner, Table, TableIndex, TableUnique } from 'typeorm'

/**
 * Adds the provider-backed identity table.
 *
 * Additive only. No existing table is read, altered or rewritten, so opening this build with an
 * existing wallet leaves its `hd_public_key_info` rows and its keystore exactly as they were.
 */
export class AddScriptIdentity1788912000000 implements MigrationInterface {
  name = 'AddScriptIdentity1788912000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'script_identity',
        columns: [
          { name: 'id', type: 'integer', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'walletId', type: 'varchar', isNullable: false },
          { name: 'providerId', type: 'varchar', isNullable: false },
          { name: 'addressType', type: 'integer', isNullable: false },
          { name: 'addressIndex', type: 'integer', isNullable: false },
          { name: 'address', type: 'varchar', isNullable: false },
          { name: 'lockCodeHash', type: 'varchar', isNullable: false },
          { name: 'lockHashType', type: 'varchar', isNullable: false },
          { name: 'lockArgs', type: 'varchar', isNullable: false },
          { name: 'derivationPath', type: 'varchar', isNullable: true },
          { name: 'publicKey', type: 'varchar', isNullable: true },
          { name: 'metadata', type: 'varchar', isNullable: true },
          { name: 'description', type: 'varchar', isNullable: true },
          { name: 'createdAt', type: 'varchar', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    )

    await queryRunner.createIndex(
      'script_identity',
      new TableIndex({ name: 'IDX_script_identity_walletId', columnNames: ['walletId'] })
    )
    await queryRunner.createIndex(
      'script_identity',
      new TableIndex({ name: 'IDX_script_identity_providerId', columnNames: ['providerId'] })
    )
    await queryRunner.createUniqueConstraint(
      'script_identity',
      new TableUnique({
        name: 'UQ_script_identity_wallet_lock',
        columnNames: ['walletId', 'lockCodeHash', 'lockHashType', 'lockArgs'],
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('script_identity', true)
  }
}
