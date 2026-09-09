/* eslint-disable */
/**
 * Cross-language golden vectors for the Nervos FIPS 205 all-in-one lock.
 *
 * GENERATED, DO NOT EDIT BY HAND. Produced by running the upstream Rust crate
 * `ckb-fips205-utils` (nervosnetwork/quantum-resistant-lock-script @ 082c0a19) against fixed
 * inputs, so these values are an oracle produced by the implementation the deployed lock is built
 * from — not a restatement of this repository's TypeScript.
 *
 * Each resolved input also carries `cellOutputMolecule`, the exact bytes the Rust side hashed. That
 * makes a divergence localisable to one field instead of showing up only as a wrong final digest.
 *
 * Regenerate only when upstream changes, and review the diff as a protocol change.
 */
export const SLH_DSA_VECTORS = {
  messageAll: [
    {
      messageDigest: '0x579bb25ccc918cce9a6077706ee8397f22d6f965d692705207884d3273f1c1b4',
      name: 'single-input-group-no-type',
      resolvedInputs: [
        {
          capacity: '0x2540be400',
          cellOutputMolecule:
            '0x6d00000010000000180000006d00000000e40b540200000055000000100000003000000031000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa02200000001111111111111111111111111111111111111111111111111111111111111111',
          data: '0x',
          lock: {
            args: '0x1111111111111111111111111111111111111111111111111111111111111111',
            codeHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            hashType: 'data1',
          },
          type: null,
        },
        {
          capacity: '0x6fc23ac00',
          cellOutputMolecule:
            '0x6100000010000000180000006100000000ac23fc0600000049000000100000003000000031000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb01140000002222222222222222222222222222222222222222',
          data: '0x01',
          lock: {
            args: '0x2222222222222222222222222222222222222222',
            codeHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            hashType: 'type',
          },
          type: null,
        },
      ],
      scriptGroupIndex: 0,
      tx: {
        cellDeps: [],
        headerDeps: [],
        inputs: [
          {
            previousOutput: {
              index: '0x0',
              txHash: '0x0101010101010101010101010101010101010101010101010101010101010101',
            },
            since: '0x0',
          },
          {
            previousOutput: {
              index: '0x2',
              txHash: '0x0303030303030303030303030303030303030303030303030303030303030303',
            },
            since: '0x0',
          },
        ],
        outputs: [
          {
            capacity: '0x218711a00',
            lock: {
              args: '0x1111111111111111111111111111111111111111111111111111111111111111',
              codeHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              hashType: 'data1',
            },
            type: null,
          },
        ],
        outputsData: ['0x'],
        version: '0x0',
        witnesses: ['0x1c00000010000000100000001c000000080000007777777777777777', '0x9999'],
      },
      txHash: '0x6437833ee4a989e85d0e62456e3035ec00daf90cb4f951f4745c95a3b564cc00',
    },
    {
      messageDigest: '0x695ca7e14b9b0c939734b6c2c7f739a9736d85edf56d4c8672a63266fc8c43b8',
      name: 'with-type-script-and-data',
      resolvedInputs: [
        {
          capacity: '0x2540be400',
          cellOutputMolecule:
            '0xa600000010000000180000006d00000000e40b540200000055000000100000003000000031000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0220000000111111111111111111111111111111111111111111111111111111111111111139000000100000003000000031000000cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc010400000033333333',
          data: '0xdeadbeef',
          lock: {
            args: '0x1111111111111111111111111111111111111111111111111111111111111111',
            codeHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            hashType: 'data1',
          },
          type: {
            args: '0x33333333',
            codeHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
            hashType: 'type',
          },
        },
        {
          capacity: '0x6fc23ac00',
          cellOutputMolecule:
            '0x6100000010000000180000006100000000ac23fc0600000049000000100000003000000031000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb01140000002222222222222222222222222222222222222222',
          data: '0x01',
          lock: {
            args: '0x2222222222222222222222222222222222222222',
            codeHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            hashType: 'type',
          },
          type: null,
        },
      ],
      scriptGroupIndex: 0,
      tx: {
        cellDeps: [],
        headerDeps: [],
        inputs: [
          {
            previousOutput: {
              index: '0x0',
              txHash: '0x0101010101010101010101010101010101010101010101010101010101010101',
            },
            since: '0x0',
          },
          {
            previousOutput: {
              index: '0x2',
              txHash: '0x0303030303030303030303030303030303030303030303030303030303030303',
            },
            since: '0x0',
          },
        ],
        outputs: [
          {
            capacity: '0x218711a00',
            lock: {
              args: '0x1111111111111111111111111111111111111111111111111111111111111111',
              codeHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              hashType: 'data1',
            },
            type: null,
          },
        ],
        outputsData: ['0x'],
        version: '0x0',
        witnesses: ['0x2300000010000000100000001c00000008000000777777777777777703000000888888', '0x9999'],
      },
      txHash: '0x6437833ee4a989e85d0e62456e3035ec00daf90cb4f951f4745c95a3b564cc00',
    },
    {
      messageDigest: '0x293ca802a7ff85d6fa38f1831866357067a8048eb0e2ff28d24225ef33dd778e',
      name: 'two-inputs-in-group',
      resolvedInputs: [
        {
          capacity: '0x2540be400',
          cellOutputMolecule:
            '0x6d00000010000000180000006d00000000e40b540200000055000000100000003000000031000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa02200000001111111111111111111111111111111111111111111111111111111111111111',
          data: '0x',
          lock: {
            args: '0x1111111111111111111111111111111111111111111111111111111111111111',
            codeHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            hashType: 'data1',
          },
          type: null,
        },
        {
          capacity: '0x4a817c800',
          cellOutputMolecule:
            '0x6d00000010000000180000006d00000000c817a80400000055000000100000003000000031000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa02200000001111111111111111111111111111111111111111111111111111111111111111',
          data: '0x',
          lock: {
            args: '0x1111111111111111111111111111111111111111111111111111111111111111',
            codeHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            hashType: 'data1',
          },
          type: null,
        },
      ],
      scriptGroupIndex: 0,
      tx: {
        cellDeps: [],
        headerDeps: [],
        inputs: [
          {
            previousOutput: {
              index: '0x0',
              txHash: '0x0101010101010101010101010101010101010101010101010101010101010101',
            },
            since: '0x0',
          },
          {
            previousOutput: {
              index: '0x1',
              txHash: '0x0202020202020202020202020202020202020202020202020202020202020202',
            },
            since: '0x0',
          },
        ],
        outputs: [
          {
            capacity: '0x218711a00',
            lock: {
              args: '0x1111111111111111111111111111111111111111111111111111111111111111',
              codeHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              hashType: 'data1',
            },
            type: null,
          },
        ],
        outputsData: ['0x'],
        version: '0x0',
        witnesses: ['0x1c00000010000000100000001c000000080000007777777777777777', '0x9999'],
      },
      txHash: '0x072612bdbb9325a4d69862e1d37c4cc7ce12270312e6fd39fe56692db0be994e',
    },
    {
      messageDigest: '0x27be6c257429f57d05f16440bfb24ae58d43ce8720a121d656605f66a8162d53',
      name: 'trailing-witness-past-input-count',
      resolvedInputs: [
        {
          capacity: '0x2540be400',
          cellOutputMolecule:
            '0xa600000010000000180000006d00000000e40b540200000055000000100000003000000031000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0220000000111111111111111111111111111111111111111111111111111111111111111139000000100000003000000031000000cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc010400000033333333',
          data: '0xdeadbeef',
          lock: {
            args: '0x1111111111111111111111111111111111111111111111111111111111111111',
            codeHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            hashType: 'data1',
          },
          type: {
            args: '0x33333333',
            codeHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
            hashType: 'type',
          },
        },
        {
          capacity: '0x4a817c800',
          cellOutputMolecule:
            '0x6d00000010000000180000006d00000000c817a80400000055000000100000003000000031000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa02200000001111111111111111111111111111111111111111111111111111111111111111',
          data: '0x',
          lock: {
            args: '0x1111111111111111111111111111111111111111111111111111111111111111',
            codeHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            hashType: 'data1',
          },
          type: null,
        },
      ],
      scriptGroupIndex: 0,
      tx: {
        cellDeps: [],
        headerDeps: [],
        inputs: [
          {
            previousOutput: {
              index: '0x0',
              txHash: '0x0101010101010101010101010101010101010101010101010101010101010101',
            },
            since: '0x0',
          },
          {
            previousOutput: {
              index: '0x1',
              txHash: '0x0202020202020202020202020202020202020202020202020202020202020202',
            },
            since: '0x0',
          },
        ],
        outputs: [
          {
            capacity: '0x218711a00',
            lock: {
              args: '0x1111111111111111111111111111111111111111111111111111111111111111',
              codeHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              hashType: 'data1',
            },
            type: null,
          },
        ],
        outputsData: ['0x'],
        version: '0x0',
        witnesses: [
          '0x2300000010000000100000001c00000008000000777777777777777703000000888888',
          '0x9999',
          '0x5a5a5a5a5a',
        ],
      },
      txHash: '0x072612bdbb9325a4d69862e1d37c4cc7ce12270312e6fd39fe56692db0be994e',
    },
  ],
  note: 'Generated from nervosnetwork/quantum-resistant-lock-script @ 082c0a19 via ckb-fips205-utils.',
  paramSets: [
    {
      argsPrefix: '0x8001010160',
      paramId: 'Sha2128F',
      paramIdValue: 48,
      publicKey: '0x4242424242424242424242424242424242424242424242424242424242424242',
      publicKeyLength: 32,
      scriptArgs: '0x5533938c584640bdcf54d6b40cc60dbd4e2e74b53bf779cdc643f74a84b81559',
      signatureLength: 17088,
      witnessPrefix: '0x8001010161',
    },
    {
      argsPrefix: '0x8001010162',
      paramId: 'Sha2128S',
      paramIdValue: 49,
      publicKey: '0x4242424242424242424242424242424242424242424242424242424242424242',
      publicKeyLength: 32,
      scriptArgs: '0x179d4710e8bb3a74774cbf59a8015c7ec8adbb2e7fea786f287d8864bd4449d6',
      signatureLength: 7856,
      witnessPrefix: '0x8001010163',
    },
    {
      argsPrefix: '0x8001010164',
      paramId: 'Sha2192F',
      paramIdValue: 50,
      publicKey: '0x424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242',
      publicKeyLength: 48,
      scriptArgs: '0xb3bdf25819332e811d8c9c082bd86d8fade7b196be8e7df6bdc97e5da5b5ad2f',
      signatureLength: 35664,
      witnessPrefix: '0x8001010165',
    },
    {
      argsPrefix: '0x8001010166',
      paramId: 'Sha2192S',
      paramIdValue: 51,
      publicKey: '0x424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242',
      publicKeyLength: 48,
      scriptArgs: '0x6b63259e4933ea5b32f66ce9f38b39222e344e2122cb7a5d5987d8a895945abe',
      signatureLength: 16224,
      witnessPrefix: '0x8001010167',
    },
    {
      argsPrefix: '0x8001010168',
      paramId: 'Sha2256F',
      paramIdValue: 52,
      publicKey:
        '0x42424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242',
      publicKeyLength: 64,
      scriptArgs: '0x1fd4e896fbca66505bad8b3418a7ff3f3520bd6e699f225328da32e16298f656',
      signatureLength: 49856,
      witnessPrefix: '0x8001010169',
    },
    {
      argsPrefix: '0x800101016a',
      paramId: 'Sha2256S',
      paramIdValue: 53,
      publicKey:
        '0x42424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242',
      publicKeyLength: 64,
      scriptArgs: '0xee094824c2c157a9c3b846508b2de51878ddfd48bc30e47de8a95962422ed3dc',
      signatureLength: 29792,
      witnessPrefix: '0x800101016b',
    },
    {
      argsPrefix: '0x800101016c',
      paramId: 'Shake128F',
      paramIdValue: 54,
      publicKey: '0x4242424242424242424242424242424242424242424242424242424242424242',
      publicKeyLength: 32,
      scriptArgs: '0xfc4e43d997f2ce0c761167c9dbfa8f3dd8cb8589151c22bebdbe67cd77370df2',
      signatureLength: 17088,
      witnessPrefix: '0x800101016d',
    },
    {
      argsPrefix: '0x800101016e',
      paramId: 'Shake128S',
      paramIdValue: 55,
      publicKey: '0x4242424242424242424242424242424242424242424242424242424242424242',
      publicKeyLength: 32,
      scriptArgs: '0x1087e18d0144511a47f5828413328bc3b8510343ca21ff217a2214285059a932',
      signatureLength: 7856,
      witnessPrefix: '0x800101016f',
    },
    {
      argsPrefix: '0x8001010170',
      paramId: 'Shake192F',
      paramIdValue: 56,
      publicKey: '0x424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242',
      publicKeyLength: 48,
      scriptArgs: '0x30605341722daf542ca7db5dbc8d28a6d87139ed1f1b3df77d1009e14f70977d',
      signatureLength: 35664,
      witnessPrefix: '0x8001010171',
    },
    {
      argsPrefix: '0x8001010172',
      paramId: 'Shake192S',
      paramIdValue: 57,
      publicKey: '0x424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242',
      publicKeyLength: 48,
      scriptArgs: '0xb312d84204a06645e36313ecce1a6b15adfa7f3da66ff0fbf73dbbc46b75d2a2',
      signatureLength: 16224,
      witnessPrefix: '0x8001010173',
    },
    {
      argsPrefix: '0x8001010174',
      paramId: 'Shake256F',
      paramIdValue: 58,
      publicKey:
        '0x42424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242',
      publicKeyLength: 64,
      scriptArgs: '0x1af0c593e64b7194237caa6a8eff9fdf5d3761dd150d6b441f865a449f661a9b',
      signatureLength: 49856,
      witnessPrefix: '0x8001010175',
    },
    {
      argsPrefix: '0x8001010176',
      paramId: 'Shake256S',
      paramIdValue: 59,
      publicKey:
        '0x42424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242424242',
      publicKeyLength: 64,
      scriptArgs: '0x2af85bcf2f7bcc6a43db1decd51ee5233af18bff1383e9fbdf5767bc187879d5',
      signatureLength: 29792,
      witnessPrefix: '0x8001010177',
    },
  ],
} as const
