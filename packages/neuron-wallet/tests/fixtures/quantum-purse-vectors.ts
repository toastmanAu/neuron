/* eslint-disable */
/**
 * Golden vectors for the Quantum Purse key-derivation scheme.
 *
 * GENERATED, DO NOT EDIT BY HAND. Produced by `qp-vector-generator`, which compiles Quantum
 * Purse's own `secure_vec.rs` and `macros.rs` (`spx_keygen!`) unmodified from
 * quantumpurse/key-vault-wasm v0.3.1 (71cd1309a5c9f8f994a49d0db81419481bd109b1)
 * against the crate versions that repository pins, so these values come from their implementation
 * rather than from a description of it.
 *
 * Regenerate with:
 *   cargo build --release && ./target/release/qp-vecgen > vectors.json
 *   node to-fixture.mjs vectors.json <this file>
 *
 * Each entry carries the three HKDF outputs as well as the resulting key, so a mismatch localises
 * to derivation rather than surfacing only as a wrong public key.
 *
 * `quantumPurseLockArgs` and `referenceLockArgs` DIFFER, and that is the point of recording both:
 * Quantum Purse hand-builds the all-in-one multisig header as `80 00 01 01` from its own
 * constants, while `single_sign_script_args_prefix` in the `ckb-fips205-utils` copy that same
 * repository vendors returns `80 01 01 01`. Both are valid 1-of-1 headers and both spend, but the
 * args are `blake2b(header || public_key)`, so one key yields two different addresses.
 */
export const QUANTUM_PURSE_KDF_PATH_PREFIX = 'ckb/quantum-purse/sphincs-plus/'

export const QUANTUM_PURSE_VECTORS = [
  {
    accounts: [
      {
        index: 0,
        path: 'ckb/quantum-purse/sphincs-plus/0',
        pkSeedKd: '0xf43d1507986c2e4797e1831aefda3cc1',
        publicKey: '0xf43d1507986c2e4797e1831aefda3cc173f7abab2aa874d7b2e65ad191d7a621',
        quantumPurseLockArgs: '0x18b286a33d67ce280ad323f786e7f7078089d9d727249d6ca00eae51dc0be205',
        referenceLockArgs: '0xd4aded61a1947a3f3fcf7ded99b4ea328727c684303077df2f0e037c5fcc0a6b',
        secretKey:
          '0x185b9abfa7b12016f6ab689aa60eaefb31ab6f1f4dfec316bf0c3199f2d8ad97f43d1507986c2e4797e1831aefda3cc173f7abab2aa874d7b2e65ad191d7a621',
        skPrfKd: '0x31ab6f1f4dfec316bf0c3199f2d8ad97',
        skSeedKd: '0x185b9abfa7b12016f6ab689aa60eaefb',
      },
      {
        index: 1,
        path: 'ckb/quantum-purse/sphincs-plus/1',
        pkSeedKd: '0x18eb879aec8887e02f286ba44c41e26c',
        publicKey: '0x18eb879aec8887e02f286ba44c41e26c5a4ad2ae9c624df4771c405e8baa7c3b',
        quantumPurseLockArgs: '0x3596f73c67bb60049441f37b7c8758ce4f5eb018d48dc094debc5cbb1ee8f9fa',
        referenceLockArgs: '0x3e2a091975bfb54cd3071537a5dce57832b5a5ce772168e8733af9d2699393ea',
        secretKey:
          '0xdc17c16588f4b943d6dc72177bb4a2d87f7f5f03c38acba65de48993d2fd695518eb879aec8887e02f286ba44c41e26c5a4ad2ae9c624df4771c405e8baa7c3b',
        skPrfKd: '0x7f7f5f03c38acba65de48993d2fd6955',
        skSeedKd: '0xdc17c16588f4b943d6dc72177bb4a2d8',
      },
    ],
    masterSeed: '0x30373e454c535a61686f767d848b9299a0a7aeb5bcc3cad1d8dfe6edf400070e151c232a31383f464d545b626970777e',
    mnemonic:
      'coral rigid mule obvious cup cost payment uphold laugh cattle tool crash pass dice pulp kangaroo device happy gloom wolf unknown parade achieve bronze bench three skin give loop permit crystal merge give entire build wire',
    n: 16,
    paramId: 48,
    parameterSet: 'SLH-DSA-SHA2-128f',
    totalWords: 36,
    wordsPerPhrase: 12,
  },
  {
    accounts: [
      {
        index: 0,
        path: 'ckb/quantum-purse/sphincs-plus/0',
        pkSeedKd: '0xf8235c39c64a0db8e7b3212e9dfcd344',
        publicKey: '0xf8235c39c64a0db8e7b3212e9dfcd344a0fa119498349f2751a6a7f1a6147413',
        quantumPurseLockArgs: '0xc7a854e3e15a4ddbe030eef50e9b537f89154885af94f5779ebb79e85366ae9f',
        referenceLockArgs: '0x7066996b24c2bd9279fd9c89de42ee8919836ff1ff9abdeb5b843046498e9201',
        secretKey:
          '0x4c19025ed7591aef963c1c7c63106e1869a6dc8a131542aff05521ae72440172f8235c39c64a0db8e7b3212e9dfcd344a0fa119498349f2751a6a7f1a6147413',
        skPrfKd: '0x69a6dc8a131542aff05521ae72440172',
        skSeedKd: '0x4c19025ed7591aef963c1c7c63106e18',
      },
      {
        index: 1,
        path: 'ckb/quantum-purse/sphincs-plus/1',
        pkSeedKd: '0x8fc8fe2a749cc21d9cf4e7d9910556fb',
        publicKey: '0x8fc8fe2a749cc21d9cf4e7d9910556fbeb880a7911c90d95e912f9306f66f514',
        quantumPurseLockArgs: '0xb261542317e5078330671fdd9a69e19e2004d1732c6e01c6275eb8995525c5c4',
        referenceLockArgs: '0x7e88b7667b883dbbf79fcf37096589276d825cd722ad4e9b0e7823873904181d',
        secretKey:
          '0xdeb4facc9bbb5c5cc3d9e8a9ec2f7bca5f1cf99f78b9757ce886660e73a0d1588fc8fe2a749cc21d9cf4e7d9910556fbeb880a7911c90d95e912f9306f66f514',
        skPrfKd: '0x5f1cf99f78b9757ce886660e73a0d158',
        skSeedKd: '0xdeb4facc9bbb5c5cc3d9e8a9ec2f7bca',
      },
    ],
    masterSeed: '0x31383f464d545b626970777e858c939aa1a8afb6bdc4cbd2d9e0e7eef501080f161d242b323940474e555c636a71787f',
    mnemonic:
      'couple sea spice one east raise place auction leader cluster ceiling crumble payment earth unit knee erosion truly guide brother upon pool dragon bulk bid truck approve good neglect casual deer process gloom fatal fun zoo',
    n: 16,
    paramId: 49,
    parameterSet: 'SLH-DSA-SHA2-128s',
    totalWords: 36,
    wordsPerPhrase: 12,
  },
  {
    accounts: [
      {
        index: 0,
        path: 'ckb/quantum-purse/sphincs-plus/0',
        pkSeedKd: '0xc7c9d83b7b84d56280edfec115a7d1946df867271c1d4ae4',
        publicKey: '0xc7c9d83b7b84d56280edfec115a7d1946df867271c1d4ae4b767d6d3490bb1eb9b0b45675a88a74224cce4ce22415677',
        quantumPurseLockArgs: '0xfb604807a8e1077e8f8a3fb9a678406c5ebdb0e92086bbec08aa29e5a6044c31',
        referenceLockArgs: '0xa1179e470297b9473b5e6818ea295b79100927cc28ad0330b594047649317313',
        secretKey:
          '0x2c67d20ee1340440230f8835f59ea00e4e14a005f9cc828a257c258235ce67a3c29c48b31bd8e9b8efffd7ef564f5311c7c9d83b7b84d56280edfec115a7d1946df867271c1d4ae4b767d6d3490bb1eb9b0b45675a88a74224cce4ce22415677',
        skPrfKd: '0x257c258235ce67a3c29c48b31bd8e9b8efffd7ef564f5311',
        skSeedKd: '0x2c67d20ee1340440230f8835f59ea00e4e14a005f9cc828a',
      },
      {
        index: 1,
        path: 'ckb/quantum-purse/sphincs-plus/1',
        pkSeedKd: '0x97cfd01cd0ce9791671876856ee2894099a86d2027a4cf8d',
        publicKey: '0x97cfd01cd0ce9791671876856ee2894099a86d2027a4cf8dab8002eca239432576baf351d4d04a3c352663d066c57259',
        quantumPurseLockArgs: '0x51a00e53886b58e2ba3ef2433d0e99d6df7f907455cba21d6988551ae02cf1ff',
        referenceLockArgs: '0x583ae9896679a01eb45d5329123079ba1a03c20a504a9fcdc06f2d31c6139210',
        secretKey:
          '0x4c96330417fbdf91241246b23bde1df5442c1a78b0d18b6642737319aea947c183acac86d91061208d384dbcd9ed5b9b97cfd01cd0ce9791671876856ee2894099a86d2027a4cf8dab8002eca239432576baf351d4d04a3c352663d066c57259',
        skPrfKd: '0x42737319aea947c183acac86d91061208d384dbcd9ed5b9b',
        skSeedKd: '0x4c96330417fbdf91241246b23bde1df5442c1a78b0d18b66',
      },
    ],
    masterSeed:
      '0x323940474e555c636a71787f868d949ba2a9b0b7bec5ccd3dae1e8eff6020910171e252c333a41484f565d646b727980878e959ca3aab1b8bfc6cdd4dbe2e9f0f7030a11181f262d',
    mnemonic:
      'cram skate balcony original fiction coyote prefer congress legend crucial gown dance clever success ten suffer smoke obtain sustain aunt desk ugly calm marine fragile seven club oil motion mountain voice concert museum hour kangaroo alert maple input grunt elder prison sword yellow super state tenant risk tiger ice lunar dutch advance change hub',
    n: 24,
    paramId: 50,
    parameterSet: 'SLH-DSA-SHA2-192f',
    totalWords: 54,
    wordsPerPhrase: 18,
  },
  {
    accounts: [
      {
        index: 0,
        path: 'ckb/quantum-purse/sphincs-plus/0',
        pkSeedKd: '0x45a68d1cb1c0cf4007c11160ce8092732ade7bd5991badf3',
        publicKey: '0x45a68d1cb1c0cf4007c11160ce8092732ade7bd5991badf35e299dfc995eb141eaa8c439c2d8196543aa2147d73f4c49',
        quantumPurseLockArgs: '0xd799fc680675c68f2f23bca58048bd5f5c32f8b4e86b98d3bf6dfee4a384a578',
        referenceLockArgs: '0x8c1888211dc11771b7ebc011d055fbacd64b7ff9a93165fcc6b64e85c967d3ed',
        secretKey:
          '0x43e5b4cd03de76600f2cf2f9b090c3789cbbf96423c328554daa4c31a646c39dab50b54030ad894b274f6ec132e8846945a68d1cb1c0cf4007c11160ce8092732ade7bd5991badf35e299dfc995eb141eaa8c439c2d8196543aa2147d73f4c49',
        skPrfKd: '0x4daa4c31a646c39dab50b54030ad894b274f6ec132e88469',
        skSeedKd: '0x43e5b4cd03de76600f2cf2f9b090c3789cbbf96423c32855',
      },
      {
        index: 1,
        path: 'ckb/quantum-purse/sphincs-plus/1',
        pkSeedKd: '0xa1b94b6553a4a2e7ae587096deec72e8a6505beaa31bc042',
        publicKey: '0xa1b94b6553a4a2e7ae587096deec72e8a6505beaa31bc042f22caacd045d90ec0353f640c2433a3dc670b80019ac0fd7',
        quantumPurseLockArgs: '0x8e8db93db55420ef24d1d47df73538e589c1e0a508568723a89a713e99d81cb1',
        referenceLockArgs: '0x413286a0e10489cba548f00f439a7af96c3c9cb520d1d9ff7e35b235612a6951',
        secretKey:
          '0xb87f2642973611e662a4f13d655956a95e4c052432c1ddce7e36f0cbb6ca8a403287f668fc5ca89bb0da847c6d28bffea1b94b6553a4a2e7ae587096deec72e8a6505beaa31bc042f22caacd045d90ec0353f640c2433a3dc670b80019ac0fd7',
        skPrfKd: '0x7e36f0cbb6ca8a403287f668fc5ca89bb0da847c6d28bffe',
        skSeedKd: '0xb87f2642973611e662a4f13d655956a95e4c052432c1ddce',
      },
    ],
    masterSeed:
      '0x333a41484f565d646b727980878e959ca3aab1b8bfc6cdd4dbe2e9f0f7030a11181f262d343b424950575e656c737a81888f969da4abb2b9c0c7ced5dce3eaf1f8040b121920272e',
    mnemonic:
      'creek spirit faith pact grape rate punch execute letter detect pistol deer deny flee title web soccer physical swim blanket label unlock cost ancient gather tooth coffee peace spatial naive air quality noble mobile kind arrow mass lake polar enable robot friend adapt what still train wide token leopard airport embody catch cheese inhale',
    n: 24,
    paramId: 51,
    parameterSet: 'SLH-DSA-SHA2-192s',
    totalWords: 54,
    wordsPerPhrase: 18,
  },
  {
    accounts: [
      {
        index: 0,
        path: 'ckb/quantum-purse/sphincs-plus/0',
        pkSeedKd: '0xd8e360b4ef7bfc7adbe1ba04d093b7867592311e8b893cbb06fcefbf70ca9f65',
        publicKey:
          '0xd8e360b4ef7bfc7adbe1ba04d093b7867592311e8b893cbb06fcefbf70ca9f6548a67ef158dc387b9af2f3dd8b04853ed13a8a632cdc235ffcd9707d4487d473',
        quantumPurseLockArgs: '0xe7846e071ad4d8289036ddcaca5f10392e6609f7f2a202cf3b4bf9b7cd390751',
        referenceLockArgs: '0xc998042718230c46568740c6f2134e95acda3d27f9fefbee04d446f5c98932c3',
        secretKey:
          '0x913682629d941562beeee7059cdb88e9b22d6a45beba74dbab8c93730ebc1de09146505fe721c567f4d45b6de1c52daf85df967f0705b0ff076396b4c239aa1ad8e360b4ef7bfc7adbe1ba04d093b7867592311e8b893cbb06fcefbf70ca9f6548a67ef158dc387b9af2f3dd8b04853ed13a8a632cdc235ffcd9707d4487d473',
        skPrfKd: '0x9146505fe721c567f4d45b6de1c52daf85df967f0705b0ff076396b4c239aa1a',
        skSeedKd: '0x913682629d941562beeee7059cdb88e9b22d6a45beba74dbab8c93730ebc1de0',
      },
      {
        index: 1,
        path: 'ckb/quantum-purse/sphincs-plus/1',
        pkSeedKd: '0xd7961d8bae786052044cbf62115ae0e904831123b9b708baa18ba49de1a1fe11',
        publicKey:
          '0xd7961d8bae786052044cbf62115ae0e904831123b9b708baa18ba49de1a1fe116ca0af0a4d31aea6b9e1f10174cfefb758f9d17ea6b1b55b5a47b41fa9105582',
        quantumPurseLockArgs: '0x4e1142cbb5d3520accb883b881ee363d28d0e0c71aa22d7b2a34aa222d8977b9',
        referenceLockArgs: '0xc7500b1eef16c26f86409172f1c3e6a73abbec1ac6aef2946112db95fb87e9f7',
        secretKey:
          '0x47c52f0bd260eca895391ce65c304943d4b89d8dab553e1bc70ac098ded90e85f79e35dc940faba3e68f8bc4b4288178306b2862beb3a3f4af80aeabc54cb523d7961d8bae786052044cbf62115ae0e904831123b9b708baa18ba49de1a1fe116ca0af0a4d31aea6b9e1f10174cfefb758f9d17ea6b1b55b5a47b41fa9105582',
        skPrfKd: '0xf79e35dc940faba3e68f8bc4b4288178306b2862beb3a3f4af80aeabc54cb523',
        skSeedKd: '0x47c52f0bd260eca895391ce65c304943d4b89d8dab553e1bc70ac098ded90e85',
      },
    ],
    masterSeed:
      '0x343b424950575e656c737a81888f969da4abb2b9c0c7ced5dce3eaf1f8040b121920272e353c434a51585f666d747b828990979ea5acb3bac1c8cfd6dde4ebf2f9050c131a21282f363d444b525960676e757c838a91989fa6adb4bbc2c9d0d7',
    mnemonic:
      'crouch sure myself pass invest crawl range hungry light dutch toss deputy enjoy sun train body solution puzzle decline sting buzz acoustic clump fade bomb abuse slide heavy service pioneer earth armor grid hill bus agree october envelope kind remain recipe stock impulse panic horse venue quit fork weekend chronic age crowd barely bleak suggest possible ensure name fix solution trap salad athlete fall obtain wood problem harvest rotate gossip drive wink',
    n: 32,
    paramId: 52,
    parameterSet: 'SLH-DSA-SHA2-256f',
    totalWords: 72,
    wordsPerPhrase: 24,
  },
  {
    accounts: [
      {
        index: 0,
        path: 'ckb/quantum-purse/sphincs-plus/0',
        pkSeedKd: '0x23ad91ad5be202e28d01c8b6c6ac9e6e8d6963fc7b95f90c815dee4add7d6d69',
        publicKey:
          '0x23ad91ad5be202e28d01c8b6c6ac9e6e8d6963fc7b95f90c815dee4add7d6d69df2af4e32c4f71bf70c0a6827f58e0e15babfa95fd6c6883ca593cc7ccae4399',
        quantumPurseLockArgs: '0x5df5d8c9ed6d230ffd560487a52beeef0374bb672e2eca0cf4f906be3f9e6f9d',
        referenceLockArgs: '0x2e8be0e2a41eb80d892abd0c58d822e5368f19948684cddd85c8505d7b08a44f',
        secretKey:
          '0x70502552eae98097f5e62cb1273f59641968bd51462dfef33e70265dacd69fdf9602310ac7f97f1211330e2bc9186965ebedabcd8858a672f1a0db0e757b4ccc23ad91ad5be202e28d01c8b6c6ac9e6e8d6963fc7b95f90c815dee4add7d6d69df2af4e32c4f71bf70c0a6827f58e0e15babfa95fd6c6883ca593cc7ccae4399',
        skPrfKd: '0x9602310ac7f97f1211330e2bc9186965ebedabcd8858a672f1a0db0e757b4ccc',
        skSeedKd: '0x70502552eae98097f5e62cb1273f59641968bd51462dfef33e70265dacd69fdf',
      },
      {
        index: 1,
        path: 'ckb/quantum-purse/sphincs-plus/1',
        pkSeedKd: '0x728a50759b4122729667a90cb5c748ffe5559f42106471a80bcbc65f0c4f0d90',
        publicKey:
          '0x728a50759b4122729667a90cb5c748ffe5559f42106471a80bcbc65f0c4f0d90544cb3af85ff550a47c7aca3134ee14c80a912cbb763a38b4c23b58506846b3d',
        quantumPurseLockArgs: '0xa0407afb083ead4a11ba329ba277dd9a01735932ee163d078c9435845b998744',
        referenceLockArgs: '0x49a14195a4ceadc369de3742787d656ea7ce12ecbc3e09e83d28ec7771c6f4c3',
        secretKey:
          '0x6a91a24cd279faf55f52f33eae7a7e4808148412cd65eb47e8473909ff73e861bb5e3d9eac3473f95c216e03d674060cf71ffa418cb1d704e481f420deba1343728a50759b4122729667a90cb5c748ffe5559f42106471a80bcbc65f0c4f0d90544cb3af85ff550a47c7aca3134ee14c80a912cbb763a38b4c23b58506846b3d',
        skPrfKd: '0xbb5e3d9eac3473f95c216e03d674060cf71ffa418cb1d704e481f420deba1343',
        skSeedKd: '0x6a91a24cd279faf55f52f33eae7a7e4808148412cd65eb47e8473909ff73e861',
      },
    ],
    masterSeed:
      '0x353c434a51585f666d747b828990979ea5acb3bac1c8cfd6dde4ebf2f9050c131a21282f363d444b525960676e757c838a91989fa6adb4bbc2c9d0d7dee5ecf3fa060d141b222930373e454c535a61686f767d848b9299a0a7aeb5bcc3cad1d8',
    mnemonic:
      'cry tilt spoon pencil magnet rebel remind month little erode chalk diary food flush twelve decorate sound report junior subject convince little core jealous boss announce armed hockey stairs certain enact clown guess inhale game alpha poverty slush leader stick regret task raven payment law indicate record genius wheel corn eagle curve card object table silly era onion obscure speak wash disagree banana inch often ahead two hidden slow tornado electric bleak',
    n: 32,
    paramId: 53,
    parameterSet: 'SLH-DSA-SHA2-256s',
    totalWords: 72,
    wordsPerPhrase: 24,
  },
  {
    accounts: [
      {
        index: 0,
        path: 'ckb/quantum-purse/sphincs-plus/0',
        pkSeedKd: '0x7b4d860538f65ce9e5f1af9201c8ae8b',
        publicKey: '0x7b4d860538f65ce9e5f1af9201c8ae8b6a78f5be461a1c98771508c687fa0fc3',
        quantumPurseLockArgs: '0xcdd988e5cecf194c2d2e6a2b522cedd1764475e32780bbf3ebf06dafe5922fbc',
        referenceLockArgs: '0x1e3bc16bd56583c8f07a4058d0db16351a956264ca084362412f49f67ab95ccb',
        secretKey:
          '0x88c3123bfffe772ffe2fc4158de803d82d87814dbae7c3e76ac0bb462db757fd7b4d860538f65ce9e5f1af9201c8ae8b6a78f5be461a1c98771508c687fa0fc3',
        skPrfKd: '0x2d87814dbae7c3e76ac0bb462db757fd',
        skSeedKd: '0x88c3123bfffe772ffe2fc4158de803d8',
      },
      {
        index: 1,
        path: 'ckb/quantum-purse/sphincs-plus/1',
        pkSeedKd: '0xe990f0d72be32d73a91c0480a02eca78',
        publicKey: '0xe990f0d72be32d73a91c0480a02eca78f68d17ab3ccad7270f8b792f524dcce8',
        quantumPurseLockArgs: '0xe20c9ce548dc35788a20b6897ccdf00073acea359d6c91ca4f56c35280bcfa34',
        referenceLockArgs: '0xb5184a42e9dccd6e4236a456f914ed1293e8409e5839c4526e4ef554b1a9350f',
        secretKey:
          '0x4607abf1da4cbba7fe1274381e447b1dd49501db0de7fea0fd90772274096c17e990f0d72be32d73a91c0480a02eca78f68d17ab3ccad7270f8b792f524dcce8',
        skPrfKd: '0xd49501db0de7fea0fd90772274096c17',
        skSeedKd: '0x4607abf1da4cbba7fe1274381e447b1d',
      },
    ],
    masterSeed: '0x363d444b525960676e757c838a91989fa6adb4bbc2c9d0d7dee5ecf3fa060d141b222930373e454c535a61686f767d84',
    mnemonic:
      'curtain tuition barrel pigeon noodle crisp right question logic fee great discover pluck horror confirm machine other hip knee rural view south local city brass bacon equal hover tone plate estate equip half knife panda angle',
    n: 16,
    paramId: 54,
    parameterSet: 'SLH-DSA-SHAKE-128f',
    totalWords: 36,
    wordsPerPhrase: 12,
  },
  {
    accounts: [
      {
        index: 0,
        path: 'ckb/quantum-purse/sphincs-plus/0',
        pkSeedKd: '0xa05f5be65203f16b15527966b277825e',
        publicKey: '0xa05f5be65203f16b15527966b277825e43ff130873bba26980a17948bf5cecb0',
        quantumPurseLockArgs: '0x0f82ddafdc376c14ca828fa7f0794c72d26b86fe80da27c208270142c0fa5aaf',
        referenceLockArgs: '0x1dea3c41acb1b78d4cf4143549aa5cca2fe2a40185157be47da8ebeb0e595204',
        secretKey:
          '0x6dc6e567a3b54054ac3e4ddd797ed0513156f5357d35c49b0e6cc6d32ba44ed1a05f5be65203f16b15527966b277825e43ff130873bba26980a17948bf5cecb0',
        skPrfKd: '0x3156f5357d35c49b0e6cc6d32ba44ed1',
        skSeedKd: '0x6dc6e567a3b54054ac3e4ddd797ed051',
      },
      {
        index: 1,
        path: 'ckb/quantum-purse/sphincs-plus/1',
        pkSeedKd: '0x3d4eada386a1d05d5f6633b6c41aad99',
        publicKey: '0x3d4eada386a1d05d5f6633b6c41aad991265503c5550042578306f2043f7df70',
        quantumPurseLockArgs: '0xa0266b2e8f2ceb81d1d9efd8fdf42f589934c746b3b2f17759ae86efeb58a24e',
        referenceLockArgs: '0x07d201f4a23d42019b6651ac9f0fffbe8d12c5e52dd45388d172f33487db7541',
        secretKey:
          '0x4556e1cfbc29221fbbacb5a13d62330fe9352489b2e93ccb1ae3cbf17a26c8323d4eada386a1d05d5f6633b6c41aad991265503c5550042578306f2043f7df70',
        skPrfKd: '0xe9352489b2e93ccb1ae3cbf17a26c832',
        skSeedKd: '0x4556e1cfbc29221fbbacb5a13d62330f',
      },
    ],
    masterSeed: '0x373e454c535a61686f767d848b9299a0a7aeb5bcc3cad1d8dfe6edf400070e151c232a31383f464d545b626970777e85',
    mnemonic:
      'damp vendor fantasy pluck plastic reflect saddle soul loyal frame please dove police interest hundred maple public unaware legend tank village ability seminar clip bring bone middle idea virtual chase fabric hobby harvest lonely text apple',
    n: 16,
    paramId: 55,
    parameterSet: 'SLH-DSA-SHAKE-128s',
    totalWords: 36,
    wordsPerPhrase: 12,
  },
  {
    accounts: [
      {
        index: 0,
        path: 'ckb/quantum-purse/sphincs-plus/0',
        pkSeedKd: '0x9d9286e7f699d7c7cbb4fbc1c7cb22f3b69cf6bc00bbac9c',
        publicKey: '0x9d9286e7f699d7c7cbb4fbc1c7cb22f3b69cf6bc00bbac9ce52a90d8642f365164dda071f4a82cf37a11779661bd3b71',
        quantumPurseLockArgs: '0x37cc357c8c1238cd02d2cf6660b27a082a89ffff44d1828fe6109e16edd02391',
        referenceLockArgs: '0xc8d128183db4b2d36117b19d1120a5c94e9ffb85a652900d5f77cd43ca92c8cd',
        secretKey:
          '0xf58ff508e1daa6d00f93f53f361f2aafb06e9ef0e47656caa766642c96cfd0eeb9d9de52da0153b80d3b97ca277b1dcb9d9286e7f699d7c7cbb4fbc1c7cb22f3b69cf6bc00bbac9ce52a90d8642f365164dda071f4a82cf37a11779661bd3b71',
        skPrfKd: '0xa766642c96cfd0eeb9d9de52da0153b80d3b97ca277b1dcb',
        skSeedKd: '0xf58ff508e1daa6d00f93f53f361f2aafb06e9ef0e47656ca',
      },
      {
        index: 1,
        path: 'ckb/quantum-purse/sphincs-plus/1',
        pkSeedKd: '0xcd66f42827f2338b9989dcf30a69a79fe383d71dbfa64ffe',
        publicKey: '0xcd66f42827f2338b9989dcf30a69a79fe383d71dbfa64ffe5f268ed364dd1bc1c2568cc52404940a9b3c7dab4a90495f',
        quantumPurseLockArgs: '0x6ec7c8e24860dd71b6db1b5bf979ed3f2443185a5e5df542ba1f8af503b1739d',
        referenceLockArgs: '0x06a3188a7f3899bec290ff573b9defbf0a6fa3bc1f3475f1aaeef2f9183636f8',
        secretKey:
          '0x966b7391a6f17b91bd58430725e60b55d400482e2569586f95f03d4f146dc2ed9e27cc0c7d5a8a6c188588b551f22517cd66f42827f2338b9989dcf30a69a79fe383d71dbfa64ffe5f268ed364dd1bc1c2568cc52404940a9b3c7dab4a90495f',
        skPrfKd: '0x95f03d4f146dc2ed9e27cc0c7d5a8a6c188588b551f22517',
        skSeedKd: '0x966b7391a6f17b91bd58430725e60b55d400482e2569586f',
      },
    ],
    masterSeed:
      '0x383f464d545b626970777e858c939aa1a8afb6bdc4cbd2d9e0e7eef501080f161d242b323940474e555c636a71787f868d949ba2a9b0b7bec5ccd3dae1e8eff6020910171e252c33',
    mnemonic:
      'deal when nation post renew cruise scrub used machine goose trade drive memory swap warfare offer spot sleep thought disorder run acoustic liberty mention innocent lyrics cram skate balcony original fiction coyote prefer congress legend critic mirror pill trim fat arena term blame omit sustain aunt desk ugly calm marine fragile seven club old',
    n: 24,
    paramId: 56,
    parameterSet: 'SLH-DSA-SHAKE-192f',
    totalWords: 54,
    wordsPerPhrase: 18,
  },
  {
    accounts: [
      {
        index: 0,
        path: 'ckb/quantum-purse/sphincs-plus/0',
        pkSeedKd: '0x56ec4f9e66907c55c411b97b12eae63685c285c81a1f8ced',
        publicKey: '0x56ec4f9e66907c55c411b97b12eae63685c285c81a1f8ced3daeb3dd7947c7a28c29c2b57aa9117550eefc30746dfc5b',
        quantumPurseLockArgs: '0x053231c3783582f980d7efed0ba15feb7fd3ad7f7333a2194bdb50202f6970e1',
        referenceLockArgs: '0x77bee963cf93993f97257ab92b7695ee2c9c82085d7012781b65c952c3263ec3',
        secretKey:
          '0x3071631157a33f50ea9c551b777cb252329ef3a10872939cfd13647fba393e51b52033dc95be8949625fa4c4a869175c56ec4f9e66907c55c411b97b12eae63685c285c81a1f8ced3daeb3dd7947c7a28c29c2b57aa9117550eefc30746dfc5b',
        skPrfKd: '0xfd13647fba393e51b52033dc95be8949625fa4c4a869175c',
        skSeedKd: '0x3071631157a33f50ea9c551b777cb252329ef3a10872939c',
      },
      {
        index: 1,
        path: 'ckb/quantum-purse/sphincs-plus/1',
        pkSeedKd: '0x0f04d3b667495abedfc20e44519160c5476e0640105f98dd',
        publicKey: '0x0f04d3b667495abedfc20e44519160c5476e0640105f98ddca849ca8ee5d9738bf943db7b7cb64fa4b15fceba7cb75b5',
        quantumPurseLockArgs: '0x3fe776de85045b5b3cf68fb1ba0526916605361e4bdf31b982c43db5972dfda9',
        referenceLockArgs: '0x1ba1913047045f566d3eaac6b89b1da65bee2e59ebecef202820c149c69084cf',
        secretKey:
          '0x0358941bae23ae4ea40c41f55752620933d77efe133e285c57ae9a18449308b845646dc64f4673e3885193ed3317e6250f04d3b667495abedfc20e44519160c5476e0640105f98ddca849ca8ee5d9738bf943db7b7cb64fa4b15fceba7cb75b5',
        skPrfKd: '0x57ae9a18449308b845646dc64f4673e3885193ed3317e625',
        skSeedKd: '0x0358941bae23ae4ea40c41f55752620933d77efe133e285c',
      },
    ],
    masterSeed:
      '0x3940474e555c636a71787f868d949ba2a9b0b7bec5ccd3dae1e8eff6020910171e252c333a41484f565d646b727980878e959ca3aab1b8bfc6cdd4dbe2e9f0f7030a11181f262d34',
    mnemonic:
      'deer acquire squeeze primary shiver release shine avocado make hole cheap earn only forward wild ridge stable spot tiger electric work advice much argue joy pitch creek spirit faith pact grape rate punch execute letter disorder model provide cigar fever breeze garment brass ritual swim blanket label unlock cost ancient gather tooth coffee parade',
    n: 24,
    paramId: 57,
    parameterSet: 'SLH-DSA-SHAKE-192s',
    totalWords: 54,
    wordsPerPhrase: 18,
  },
  {
    accounts: [
      {
        index: 0,
        path: 'ckb/quantum-purse/sphincs-plus/0',
        pkSeedKd: '0xabe3a2b75f9ced93303ea1f292f893e629a729b88718397a9add4d02b5de9807',
        publicKey:
          '0xabe3a2b75f9ced93303ea1f292f893e629a729b88718397a9add4d02b5de98071835cfe41521dcf14bb344779e301677b364da52d4c61408fd328390a6f9d222',
        quantumPurseLockArgs: '0x4c5d382d941b4cbc3f92b0520a9f860c7e518cce96e82f1bde37b8a8adcbe3d3',
        referenceLockArgs: '0x0e8322c4787c3d8b48bca8e59916966eba0e7c51ad2ff0c9fadbb39ab53357eb',
        secretKey:
          '0x7aaa36bd3289c920aec7347efa774c52314c05436c327213009d1e308fca59209cd0fb370b21d4a5a6e1ae0bc09a446e9154920c9e9a56df63b72393aa242a44abe3a2b75f9ced93303ea1f292f893e629a729b88718397a9add4d02b5de98071835cfe41521dcf14bb344779e301677b364da52d4c61408fd328390a6f9d222',
        skPrfKd: '0x9cd0fb370b21d4a5a6e1ae0bc09a446e9154920c9e9a56df63b72393aa242a44',
        skSeedKd: '0x7aaa36bd3289c920aec7347efa774c52314c05436c327213009d1e308fca5920',
      },
      {
        index: 1,
        path: 'ckb/quantum-purse/sphincs-plus/1',
        pkSeedKd: '0xbdb5fde3e08cc0baa2eb392662081e28dd7eb03ee7e9450eadc8f425fc4a311e',
        publicKey:
          '0xbdb5fde3e08cc0baa2eb392662081e28dd7eb03ee7e9450eadc8f425fc4a311e89684af25a107f64c97e86ae84be80f12fe4a1802457a3c7f805dcc1764161a1',
        quantumPurseLockArgs: '0x298ccb47b8cf217b56245428b839671948e8efca26b02a69fd3bd2f0f9cf2625',
        referenceLockArgs: '0x0c6b354a3ac5a9bfb0ea9eb9a41964436d84502def382f77ee0e050a924945b1',
        secretKey:
          '0x41b0e690fe58888381c66be748afbdfab8251d612c8a301cea7e1327c8436f12a0eac14731c78ebdad31c9674718c4fad88426faee9992d34fa4064935288d8ebdb5fde3e08cc0baa2eb392662081e28dd7eb03ee7e9450eadc8f425fc4a311e89684af25a107f64c97e86ae84be80f12fe4a1802457a3c7f805dcc1764161a1',
        skPrfKd: '0xa0eac14731c78ebdad31c9674718c4fad88426faee9992d34fa4064935288d8e',
        skSeedKd: '0x41b0e690fe58888381c66be748afbdfab8251d612c8a301cea7e1327c8436f12',
      },
    ],
    masterSeed:
      '0x3a41484f565d646b727980878e959ca3aab1b8bfc6cdd4dbe2e9f0f7030a11181f262d343b424950575e656c737a81888f969da4abb2b9c0c7ced5dce3eaf1f8040b121920272e353c434a51585f666d747b828990979ea5acb3bac1c8cfd6dd',
    mnemonic:
      'demise apart because protect stone cup size copy maple input grunt elder prison sword yellow super state tenant risk tiger ice lunar dutch bid busy cousin escape isolate cause popular frost smile hockey orange parrot baby west excite naive iron right alert victory produce soda voice side arena advice flat main doctor indicate box valve harsh eyebrow seed sunset sustain element scout chaos base pact coin coconut intact broken gun fork pluck',
    n: 32,
    paramId: 58,
    parameterSet: 'SLH-DSA-SHAKE-256f',
    totalWords: 72,
    wordsPerPhrase: 24,
  },
  {
    accounts: [
      {
        index: 0,
        path: 'ckb/quantum-purse/sphincs-plus/0',
        pkSeedKd: '0x8d5f279f7cb8efc880d08cd57d175bddda06ae13b3f0e93329ccac0a9ff8e565',
        publicKey:
          '0x8d5f279f7cb8efc880d08cd57d175bddda06ae13b3f0e93329ccac0a9ff8e56574925e9eed840f4d30466fb69c31d97de3f8d0c226072dcc8509adff379816bd',
        quantumPurseLockArgs: '0xb5aa2ba54ed44a49f16bc09eaefc27d75aa655b312481604a6a5b5be646bfbb9',
        referenceLockArgs: '0xb43fe5a10c880717b864f15a79d5daec19efde6cb33739ac3ced026fd7269ca7',
        secretKey:
          '0x1244bb60880c512423afb14eae3b25f8f236a35a5f0a7fbedd2ccb671c62fbebfb07d9f724671eb6d721ca4779496b6a34fe739a7c868034e0596c7e6d4191b98d5f279f7cb8efc880d08cd57d175bddda06ae13b3f0e93329ccac0a9ff8e56574925e9eed840f4d30466fb69c31d97de3f8d0c226072dcc8509adff379816bd',
        skPrfKd: '0xfb07d9f724671eb6d721ca4779496b6a34fe739a7c868034e0596c7e6d4191b9',
        skSeedKd: '0x1244bb60880c512423afb14eae3b25f8f236a35a5f0a7fbedd2ccb671c62fbeb',
      },
      {
        index: 1,
        path: 'ckb/quantum-purse/sphincs-plus/1',
        pkSeedKd: '0x9fabf5c1f7c86c4ebb800f1e612172cf65374c88dbe31c071a99deaccbd38871',
        publicKey:
          '0x9fabf5c1f7c86c4ebb800f1e612172cf65374c88dbe31c071a99deaccbd38871201c1eed62779476318b5acfe76daee291a212551a61532cf68805b50f88df61',
        quantumPurseLockArgs: '0x6e07ef98205c127b83cb1001b1172a9b170e189184f5ab6c6bbec9de1d373f4a',
        referenceLockArgs: '0x37936f20d415fab4cc76a2d4129573c9831891b6de06ebd5c201a97e9bf99789',
        secretKey:
          '0x08b3119d8a7a84bf55c535ef71afe603237321ec657e8f266eac87b4e760816ad957f6c972aa042ee2b28563c53444856215325571fa8b59d2615b91aaa927e39fabf5c1f7c86c4ebb800f1e612172cf65374c88dbe31c071a99deaccbd38871201c1eed62779476318b5acfe76daee291a212551a61532cf68805b50f88df61',
        skPrfKd: '0xd957f6c972aa042ee2b28563c53444856215325571fa8b59d2615b91aaa927e3',
        skSeedKd: '0x08b3119d8a7a84bf55c535ef71afe603237321ec657e8f266eac87b4e760816a',
      },
    ],
    masterSeed:
      '0x3b424950575e656c737a81888f969da4abb2b9c0c7ced5dce3eaf1f8040b121920272e353c434a51585f666d747b828990979ea5acb3bac1c8cfd6dde4ebf2f9050c131a21282f363d444b525960676e757c838a91989fa6adb4bbc2c9d0d7de',
    mnemonic:
      'deputy banner favorite push town renew social expand mass lake polar enable robot friend adapt what still train wide token leopard airport embody chalk cage defense minute joy cruise chunk gesture under hope phrase thing basket annual soon note nose river atom crop pumpkin tattoo invest slogan come agree gauge shoot drastic load only vital maximum false slam border table fit dove clean credit panic cube honey jealous clutch trick garage surge',
    n: 32,
    paramId: 59,
    parameterSet: 'SLH-DSA-SHAKE-256s',
    totalWords: 72,
    wordsPerPhrase: 24,
  },
]
