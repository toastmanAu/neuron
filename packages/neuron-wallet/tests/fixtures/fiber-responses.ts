/* eslint-disable */
/**
 * Real responses captured from a Fiber node (v0.9.0-rc7, CKB testnet) on 2026-09-09.
 *
 * Captured rather than invented so the response shapes these tests assert against are the ones a
 * node actually sends — field names, hex encodings, optional fields and all. A hand-written fixture
 * would only ever prove that the parser agrees with whoever wrote the fixture.
 *
 * Nothing here is secret: node pubkeys, addresses and channel metadata are public gossip. The
 * node's auth token is not part of this file.
 */
export const FIBER_RESPONSES = {
  nodeInfo: {
    version: '0.9.0-rc7',
    commit_hash: 'bc361aa 2026-07-02',
    pubkey: '024508b9ab7d2d8f8d67a882aa3ddc34c0095748713218b3a244684fceb8cfec4c',
    features: ['GOSSIP_QUERIES_REQUIRED', 'BASIC_MPP_REQUIRED', 'TRAMPOLINE_ROUTING_REQUIRED'],
    node_name: null,
    addresses: [
      '/ip4/0.0.0.0/tcp/8228/p2p/QmUq8KqaXxusp3DfJZQMwTeZpnjqSnfCt8bDw3CiBVjitM',
      '/ip4/0.0.0.0/tcp/8228/ws/p2p/QmUq8KqaXxusp3DfJZQMwTeZpnjqSnfCt8bDw3CiBVjitM',
      '/ip4/192.168.68.80/tcp/8228/p2p/QmUq8KqaXxusp3DfJZQMwTeZpnjqSnfCt8bDw3CiBVjitM',
    ],
    chain_hash: '0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606',
    open_channel_auto_accept_min_ckb_funding_amount: '0x2540be400',
    auto_accept_channel_ckb_funding_amount: '0x24e160300',
    default_funding_lock_script: {
      code_hash: '0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8',
      hash_type: 'type',
      args: '0x5e10eee362810f545e668a532d1d6de2bb407454',
    },
    tlc_expiry_delta: '0xdbba00',
    tlc_min_value: '0x0',
    tlc_fee_proportional_millionths: '0x3e8',
    channel_count: '0x1',
    pending_channel_count: '0x0',
    peers_count: '0x1',
    udt_cfg_infos: [],
  },
  listPeers: {
    peers: [
      {
        pubkey: '03228fd9dbcdbd8ab98c6780be9fbff7d22fbaacdd9bbfd6169b613791c371d7e1',
        address: '/ip4/192.168.68.102/tcp/46922/p2p/QmekBNWM1A6KoHpS9BZkGBC9K4GpCqX2ZWFzyz5U64tesS',
      },
    ],
  },
  listChannels: {
    channels: [
      {
        channel_id: '0xa13393a81da548cb3f90c25de0efdc36f946fa78db75d0e0147bf9ab17036701',
        is_public: true,
        is_acceptor: true,
        is_one_way: false,
        channel_outpoint: '0x3e3324b4e868b035f3a8f064dc5a03969c167002f830da0610036721b453399c00000000',
        pubkey: '03228fd9dbcdbd8ab98c6780be9fbff7d22fbaacdd9bbfd6169b613791c371d7e1',
        funding_udt_type_script: null,
        state: {
          state_name: 'ChannelReady',
        },
        local_balance: '0x0',
        offered_tlc_balance: '0x0',
        remote_balance: '0x956257100',
        received_tlc_balance: '0x0',
        pending_tlcs: [],
        latest_commitment_transaction_hash: '0x65b0f6f285ae03ff687f7dcd9bc91b281e418ff3ebc72e7656a215107113cf90',
        created_at: '0x19f3d06eb12',
        enabled: true,
        tlc_expiry_delta: '0xdbba00',
        tlc_fee_proportional_millionths: '0x3e8',
        shutdown_transaction_hash: null,
        failure_detail: null,
      },
    ],
  },
} as const
