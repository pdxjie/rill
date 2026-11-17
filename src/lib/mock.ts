import type {
  AnalysisResult,
  ClientRow,
  ConnectResult,
  ConnectionConfig,
  ConnectionView,
  ConsoleResult,
  ConsoleValue,
  DatabaseEntry,
  KeyDetail,
  KeyMeta,
  NamespaceTreeResult,
  Overview,
  RedisType,
  SaveConnectionInput,
  ScanPage,
  SlowLogEntry,
  SwitchDbResult,
  TestConnectionResult,
  ValueData,
} from './types'
import { globToRegex, keyPrefix, sleep } from './utils'

interface MockKey {
  type: RedisType
  ttl: number
  size: number
  string?: string
  hash?: [string, string][]
  list?: string[]
  set?: string[]
  zset?: { member: string; score: number }[]
  stream?: { id: string; fields: [string, string][] }[]
}

const bytesOf = (text: string) => new TextEncoder().encode(text).length

const keys = new Map<string, MockKey>()

function addString(key: string, value: string, ttl = -1) {
  keys.set(key, { type: 'string', ttl, size: bytesOf(value) + key.length + 8, string: value })
}
function addHash(key: string, values: [string, string][], ttl = -1) {
  keys.set(key, {
    type: 'hash',
    ttl,
    size: values.reduce((acc, [f, v]) => acc + bytesOf(f) + bytesOf(v) + 24, 48) + key.length,
    hash: values,
  })
}
function addList(key: string, values: string[], ttl = -1) {
  keys.set(key, {
    type: 'list',
    ttl,
    size: values.reduce((acc, v) => acc + bytesOf(v) + 12, 48) + key.length,
    list: values,
  })
}
function addSet(key: string, values: string[], ttl = -1) {
  keys.set(key, {
    type: 'set',
    ttl,
    size: values.reduce((acc, v) => acc + bytesOf(v) + 16, 48) + key.length,
    set: values,
  })
}
function addZSet(key: string, values: { member: string; score: number }[], ttl = -1) {
  keys.set(key, {
    type: 'zset',
    ttl,
    size: values.reduce((acc, v) => acc + bytesOf(v.member) + 20, 56) + key.length,
    zset: values,
  })
}
function addStream(key: string, values: { id: string; fields: [string, string][] }[], ttl = -1) {
  keys.set(key, {
    type: 'stream',
    ttl,
    size: values.reduce(
      (acc, v) => acc + v.fields.reduce((a, [f, val]) => a + bytesOf(f) + bytesOf(val), 0) + 30,
      64,
    ),
    stream: values,
  })
}

const profile = (id: number, name: string, city: string, vip: number) =>
  JSON.stringify(
    {
      id,
      name,
      email: `user${id}@example.com`,
      city,
      vip_level: vip,
      registered_at: '2025-08-21T09:12:44+08:00',
      preferences: { currency: 'CNY', language: 'zh-CN', marketing: false },
      stats: { orders: 12 + id % 7, ltv: 4832.5 + id },
    },
    null,
    2,
  )

const feed = JSON.stringify(
  {
    generated_at: '2026-11-16T13:20:00+08:00',
    ttl: 300,
    sections: [
      {
        id: 'for_you',
        title: '为你推荐',
        items: Array.from({ length: 8 }, (_, i) => ({
          sku: `MC-${8800 + i}`,
          title: `秋冬新品 ${i + 1}`,
          price: 199 + i * 40,
          image: `https://cdn.example.com/p/${8800 + i}.webp`,
          stock: 120 - i * 7,
        })),
      },
      {
        id: 'trending',
        title: '热卖榜',
        items: Array.from({ length: 6 }, (_, i) => ({
          sku: `MC-${9200 + i}`,
          title: `热卖单品 ${i + 1}`,
          price: 329 + i * 25,
          rank: i + 1,
        })),
      },
    ],
  },
  null,
  2,
)

addHash('config:feature_flags', [
  ['checkout_v2', 'true'],
  ['new_search', 'true'],
  ['coupon_stack', 'false'],
  ['warehouse_split', 'true'],
  ['payment_retry', 'true'],
])
addHash('config:rate_limits', [
  ['api_default', '1200'],
  ['api_vip', '6000'],
  ['login', '12'],
  ['search', '300'],
])
for (let i = 1; i <= 6; i++) {
  addHash(`order:20261116:${88300 + i}`, [
    ['order_no', `SO2026111600${i}`],
    ['status', i % 3 === 0 ? 'SHIPPED' : i % 2 === 0 ? 'PAID' : 'PENDING'],
    ['amount', (899 + i * 120).toFixed(2)],
    ['currency', 'CNY'],
    ['user_id', String(100230 + i)],
    ['channel', i % 2 === 0 ? 'shopify' : 'manual'],
    ['warehouse', i % 2 === 0 ? 'WH-SH-01' : 'WH-GZ-02'],
    ['created_at', `2026-11-16T1${i}:41:09+08:00`],
  ])
}
addZSet(
  'order:20261116:index:paid',
  Array.from({ length: 12 }, (_, i) => ({ member: `SO2026111600${i + 1}`, score: 1763260800 + i * 60 })),
)
addString('user:100238:profile', profile(100238, '陈嘉禾', '上海', 3))
addString('user:100239:profile', profile(100239, '林小满', '杭州', 2))
addString('user:100240:profile', profile(100240, '周屿', '深圳', 1))
addString('user:100241:profile', profile(100241, '沈知夏', '成都', 2))
addList('user:100238:cart', ['MC-8831', 'MC-2290', 'MC-7741'])
addSet('user:100238:tags', ['vip', 'high_ltv', 'shanghai', 'early_adopter'])
addString(
  'session:9f2c41d0b8e34c17',
  JSON.stringify({ uid: 100238, ip: '116.228.12.44', device: 'iPhone 16 Pro', login_at: 1763260800, csrf: 'kR7f…' }),
  1840,
)
addString(
  'session:7ab91c22f0d54e91',
  JSON.stringify({ uid: 100239, ip: '125.118.9.201', device: 'MacBook Pro', login_at: 1763257200 }),
  920,
)
addHash('cache:sku:8831', [
  ['sku', 'MC-8831'],
  ['title', '轻量防风冲锋衣 · 曜石黑'],
  ['price', '899.00'],
  ['stock', '128'],
  ['status', 'ON_SALE'],
  ['updated_at', '2026-11-16T12:58:31+08:00'],
])
addHash('cache:sku:2290', [
  ['sku', 'MC-2290'],
  ['title', '羊毛混纺围巾 · 燕麦色'],
  ['price', '269.00'],
  ['stock', '0'],
  ['status', 'SOLD_OUT'],
])
addString('cache:homepage:feed', feed)
addString(
  'cache:category:tree',
  JSON.stringify([
    { id: 1, name: '女装', children: [{ id: 11, name: '外套' }, { id: 12, name: '针织' }] },
    { id: 2, name: '男装', children: [{ id: 21, name: '冲锋衣' }, { id: 22, name: '裤装' }] },
  ]),
)
addZSet(
  'rate:api:100238',
  Array.from({ length: 9 }, (_, i) => ({ member: String(1763260800 + i * 60), score: 3 + (i % 4) })),
)
addZSet('rate:api:100239', [{ member: '1763260800', score: 41 }])
addList('bull:email:wait', ['msg:88121', 'msg:88122', 'msg:88123', 'msg:88124'])
addList('bull:email:active', ['msg:88119'])
addHash('bull:email:meta', [
  ['name', 'email'],
  ['concurrency', '8'],
  ['paused', 'false'],
  ['completed', '128421'],
  ['failed', '37'],
])
addList('queue:payment:dead', ['job:payment:88231', 'job:payment:88229'])
addString('lock:order:88301', '4f2c1a9e-88b1-4b1a-9f71-1d2e3f4a5b6c', 27)
addString('lock:inventory:8831', 'c81e728d9d4c2f636f067f89cc14862c', 8)
addString('metrics:requests:2026111612', '1842931')
addString('metrics:requests:2026111613', '982773')
addZSet('leaderboard:weekly', [
  { member: 'user:100238', score: 18420 },
  { member: 'user:100239', score: 17110 },
  { member: 'user:100240', score: 15980 },
  { member: 'user:100241', score: 14320 },
  { member: 'user:100242', score: 12880 },
  { member: 'user:100243', score: 11802 },
])
addZSet('leaderboard:daily', [
  { member: 'user:100239', score: 3220 },
  { member: 'user:100238', score: 2910 },
  { member: 'user:100244', score: 2770 },
])
addStream(
  'notification:stream',
  Array.from({ length: 5 }, (_, i) => ({
    id: `176326${String(1400 + i).padStart(4, '0')}-0`,
    fields: [
      ['uid', String(100238 + (i % 3))],
      ['type', i % 2 === 0 ? 'order_shipped' : 'coupon'],
      ['title', i % 2 === 0 ? '你的订单已发货' : '你有一张 50 元优惠券'],
      ['read', i > 2 ? 'false' : 'true'],
    ] as [string, string][],
  })),
)
addStream(
  'audit:2026-11-16',
  Array.from({ length: 3 }, (_, i) => ({
    id: `176325${String(9000 + i).padStart(4, '0')}-0`,
    fields: [
      ['actor', 'admin'],
      ['action', i === 0 ? 'config.update' : 'order.refund'],
      ['target', `8830${i + 1}`],
      ['ip', '10.20.0.18'],
    ] as [string, string][],
  })),
)
addZSet(
  'search:hot:keywords',
  ['冲锋衣', '羊毛围巾', '雪地靴', '羽绒服', '通勤包'].map((member, i) => ({
    member,
    score: 9800 - i * 731,
  })),
)
addSet('coupon:SUMMER2026', ['CPN-8812', 'CPN-8813', 'CPN-8814', 'CPN-8815'])
addHash('inventory:sku:8831', [
  ['WH-SH-01', '42'],
  ['WH-GZ-02', '86'],
  ['WH-BJ-03', '0'],
])
addZSet(
  'geo:warehouse:shanghai',
  ['WH-SH-01', 'WH-SH-02', 'WH-SH-03'].map((member, i) => ({ member, score: 121470000 + i * 1000 })),
)
addString('feature:checkout:v2', 'true')
addString('app:version', '2026.11.16-rc3')
addString('expired:demo', 'this key expires in 12 seconds', 12)
addList('queue:sync:retry', ['sync:8821', 'sync:8822'])
addHash('job:daily:report', [
  ['status', 'running'],
  ['progress', '68'],
  ['started_at', '2026-11-16T02:00:00+08:00'],
])
addSet('permission:role:admin', ['order.read', 'order.write', 'config.read', 'config.write', 'user.read'])
addSet('permission:role:operator', ['order.read', 'order.write', 'user.read'])
addSet('api:token:blacklist', ['tk_9f2c41d0', 'tk_7ab91c22'])
addString('metrics:latency:p99', '38.4')
addString(
  'tmp:upload:8812',
  '{"chunks":12,"checksum":"9f2c41d0b8e34c17","received":10485760,"total":10485760}',
  3600,
)

// A few more keys to make the browser feel alive.
for (let i = 1; i <= 8; i++) {
  addHash(`cache:product:detail:${8800 + i}`, [
    ['id', String(8800 + i)],
    ['title', `商品详情缓存 ${i}`],
    ['price', String(199 + i * 30)],
    ['hit', 'true'],
  ])
}

// Optional QA dataset: /?mock=1&big=1&view=keys
// A mixed namespace with 250 direct keys plus one child folder, used to
// verify that "load more" stops at the direct-key count.
if (
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('big')
) {
  for (let i = 0; i < 250; i++) {
    addString(`qa:mixed:item-${String(i).padStart(3, '0')}`, `value-${i}`, i % 3 === 0 ? 1800 : -1)
  }
  addString('qa:mixed:sub:child', 'nested-value', 600)
  // Sparse direct keys mixed with many deeper keys: the old client-side
  // filtering would only surface 1-2 direct keys per page.
  for (let i = 0; i < 50; i++) {
    addString(`qa:sparse:k-${String(i).padStart(3, '0')}`, `sparse-${i}`, -1)
  }
  for (let i = 0; i < 600; i++) {
    addString(`qa:sparse:deep:item-${String(i).padStart(3, '0')}`, `deep-${i}`, -1)
  }
}

const baseConfigs: ConnectionConfig[] = [
  {
    id: 'prod-orders',
    name: '订单中心',
    host: '10.20.8.31',
    port: 6379,
    db: 0,
    username: null,
    tls: false,
    tlsInsecure: false,
    ssh: null,
    color: '#FF6B57',
    env: 'production',
    readOnly: false,
    hasPassword: true,
    createdAt: 1762000000000,
    lastUsedAt: Date.now() - 1000 * 60 * 8,
  },
  {
    id: 'staging',
    name: '预发环境',
    host: '10.20.9.12',
    port: 6379,
    db: 2,
    username: 'staging',
    tls: false,
    tlsInsecure: false,
    ssh: { host: 'bastion.example.com', port: 22, user: 'deploy', keyPath: '~/.ssh/id_ed25519' },
    color: '#FBBF24',
    env: 'staging',
    readOnly: false,
    hasPassword: true,
    createdAt: 1761000000000,
    lastUsedAt: Date.now() - 1000 * 60 * 60 * 26,
  },
  {
    id: 'local',
    name: '本地开发',
    host: '127.0.0.1',
    port: 6379,
    db: 0,
    username: null,
    tls: false,
    tlsInsecure: false,
    ssh: null,
    color: '#4ADE80',
    env: 'local',
    readOnly: false,
    hasPassword: false,
    createdAt: 1759000000000,
    lastUsedAt: Date.now() - 1000 * 60 * 60 * 2,
  },
  {
    id: 'sessions',
    name: '会话存储',
    host: '10.20.8.44',
    port: 6380,
    db: 1,
    username: null,
    tls: true,
    tlsInsecure: false,
    ssh: null,
    color: '#A78BFA',
    env: 'production',
    readOnly: true,
    hasPassword: true,
    createdAt: 1758000000000,
    lastUsedAt: Date.now() - 1000 * 60 * 60 * 4,
  },
  {
    id: 'queue',
    name: '任务队列',
    host: '10.20.8.52',
    port: 6379,
    db: 0,
    username: null,
    tls: false,
    tlsInsecure: false,
    ssh: null,
    color: '#22D3EE',
    env: 'staging',
    readOnly: false,
    hasPassword: true,
    createdAt: 1757000000000,
    lastUsedAt: Date.now() - 1000 * 60 * 60 * 50,
  },
]

let connections: ConnectionConfig[] = [...baseConfigs]
const connected = new Set<string>(['prod-orders'])
let mockCurrentDb = 0

const nowSec = () => Math.floor(Date.now() / 1000)

function pageFor(entry: MockKey, cursor: string, count: number): ValueData {
  switch (entry.type) {
    case 'string':
      return {
        kind: 'string',
        text: entry.string ?? '',
        bytes: bytesOf(entry.string ?? ''),
        truncated: false,
        binary: false,
      }
    case 'hash': {
      const all = entry.hash ?? []
      const offset = Number(cursor) || 0
      const items = all.slice(offset, offset + count).map(([field, value]) => ({ field, value }))
      return {
        kind: 'hash',
        items,
        cursor: offset + items.length,
        done: offset + items.length >= all.length,
        total: all.length,
      }
    }
    case 'list': {
      const all = entry.list ?? []
      const offset = Number(cursor) || 0
      const items = all
        .slice(offset, offset + count)
        .map((value, i) => ({ index: offset + i, value }))
      return {
        kind: 'list',
        items,
        nextStart: offset + items.length,
        done: offset + items.length >= all.length,
        total: all.length,
      }
    }
    case 'set': {
      const all = entry.set ?? []
      const offset = Number(cursor) || 0
      const items = all.slice(offset, offset + count)
      return {
        kind: 'set',
        items,
        cursor: offset + items.length,
        done: offset + items.length >= all.length,
        total: all.length,
      }
    }
    case 'zset': {
      const all = entry.zset ?? []
      const offset = Number(cursor) || 0
      const items = all.slice(offset, offset + count)
      return {
        kind: 'zset',
        items,
        cursor: offset + items.length,
        done: offset + items.length >= all.length,
        total: all.length,
      }
    }
    case 'stream': {
      const all = entry.stream ?? []
      let startIndex = 0
      if (cursor && cursor !== '0') {
        startIndex = all.findIndex((entry) => entry.id === cursor) + 1
      }
      const entries = all.slice(startIndex, startIndex + count).map((e) => ({
        id: e.id,
        fields: e.fields.map(([field, value]) => ({ field, value })),
      }))
      return {
        kind: 'stream',
        entries,
        lastId: entries.length ? entries[entries.length - 1].id : cursor,
        done: startIndex + entries.length >= all.length,
        total: all.length,
      }
    }
    default:
      return { kind: 'unsupported', note: 'Mock 不支持该类型' }
  }
}

function overviewData(): Overview {
  const historyBias = 0
  const hits = 1_284_932_201
  const misses = 35_982_112
  const sections = [
    {
      name: 'Server',
      items: [
        ['redis_version', '8.0.1'],
        ['redis_git_sha1', '9f2c41d0'],
        ['redis_mode', 'standalone'],
        ['os', 'Linux 6.8.0-45-generic x86_64'],
        ['arch_bits', '64'],
        ['process_id', '1842'],
        ['uptime_in_seconds', '3312042'],
        ['tcp_port', '6379'],
        ['hz', '10'],
        ['executable', '/usr/bin/redis-server'],
      ].map(([key, value]) => ({ key, value })),
    },
    {
      name: 'Clients',
      items: [
        ['connected_clients', '42'],
        ['maxclients', '10000'],
        ['blocked_clients', '0'],
        ['tracking_clients', '0'],
        ['client_recent_max_input_buffer', '16384'],
      ].map(([key, value]) => ({ key, value })),
    },
    {
      name: 'Memory',
      items: [
        ['used_memory', '1975684956'],
        ['used_memory_human', '1.84G'],
        ['used_memory_rss', '2214592512'],
        ['used_memory_peak', '3128295424'],
        ['maxmemory', '4294967296'],
        ['maxmemory_policy', 'allkeys-lru'],
        ['mem_fragmentation_ratio', '1.12'],
        ['mem_allocator', 'jemalloc-5.3.0'],
      ].map(([key, value]) => ({ key, value })),
    },
    {
      name: 'Persistence',
      items: [
        ['loading', '0'],
        ['rdb_changes_since_last_save', '18342'],
        ['rdb_bgsave_in_progress', '0'],
        ['rdb_last_bgsave_status', 'ok'],
        ['rdb_last_save_time', String(nowSec() - 621)],
        ['aof_enabled', '0'],
      ].map(([key, value]) => ({ key, value })),
    },
    {
      name: 'Stats',
      items: [
        ['total_connections_received', '184230'],
        ['total_commands_processed', '928301244'],
        ['instantaneous_ops_per_sec', String(12480 + historyBias)],
        ['total_net_input_bytes', '184293821321'],
        ['total_net_output_bytes', '431928374201'],
        ['keyspace_hits', String(hits)],
        ['keyspace_misses', String(misses)],
        ['expired_keys', '88213'],
        ['evicted_keys', '1204'],
        ['rejected_connections', '0'],
      ].map(([key, value]) => ({ key, value })),
    },
    {
      name: 'Replication',
      items: [
        ['role', 'master'],
        ['connected_slaves', '1'],
        ['slave0', 'ip=10.20.8.32,port=6379,state=online,offset=184293821,lag=0'],
        ['master_repl_offset', '184293821'],
        ['repl_backlog_active', '1'],
      ].map(([key, value]) => ({ key, value })),
    },
    {
      name: 'CPU',
      items: [
        ['used_cpu_sys', '18231.42'],
        ['used_cpu_user', '14223.18'],
        ['used_cpu_sys_children', '12.42'],
        ['used_cpu_user_children', '9.21'],
      ].map(([key, value]) => ({ key, value })),
    },
    {
      name: 'Keyspace',
      items: [
        ['db0', 'keys=982341,expires=18322,avg_ttl=1840293'],
        ['db1', 'keys=301051,expires=301051,avg_ttl=920311'],
      ].map(([key, value]) => ({ key, value })),
    },
    {
      name: 'Commandstats',
      items: [
        ['cmdstat_get', 'calls=418293201,usec=612983201,usec_per_call=1.47,rejected_calls=0,failed_calls=182'],
        ['cmdstat_set', 'calls=128392011,usec=382910221,usec_per_call=2.98,rejected_calls=0,failed_calls=0'],
        ['cmdstat_hgetall', 'calls=88201932,usec=264605796,usec_per_call=3.00,rejected_calls=0,failed_calls=12'],
        ['cmdstat_scan', 'calls=1823921,usec=49283712,usec_per_call=27.02,rejected_calls=0,failed_calls=0'],
        ['cmdstat_expire', 'calls=992101,usec=2984012,usec_per_call=3.01,rejected_calls=0,failed_calls=0'],
        ['cmdstat_del', 'calls=432102,usec=1283012,usec_per_call=2.97,rejected_calls=0,failed_calls=0'],
        ['cmdstat_pipeline', 'calls=381203,usec=882013,usec_per_call=2.31,rejected_calls=0,failed_calls=0'],
      ].map(([key, value]) => ({ key, value })),
    },
  ]

  return {
    version: '8.0.1',
    mode: 'standalone',
    role: 'master',
    os: 'Linux 6.8.0-45-generic x86_64',
    uptimeSecs: 3_312_042,
    connectedClients: 42,
    usedMemory: 1_975_684_956,
    usedMemoryPeak: 3_128_295_424,
    maxMemory: 4_294_967_296,
    maxmemoryPolicy: 'allkeys-lru',
    memFragmentationRatio: 1.12,
    totalConnectionsReceived: 184_230,
    totalCommandsProcessed: 928_301_244,
    opsPerSec: 12_480,
    keyspaceHits: hits,
    keyspaceMisses: misses,
    expiredKeys: 88_213,
    evictedKeys: 1_204,
    rejectedConnections: 0,
    netInputBytes: 184_293_821_321,
    netOutputBytes: 431_928_374_201,
    rdbLastSaveTime: nowSec() - 621,
    aofEnabled: false,
    dbsize: 1_283_392,
    dbs: [
      { db: 'db0', keys: 982_341, expires: 18_322, avgTtl: 1_840_293 },
      { db: 'db1', keys: 301_051, expires: 301_051, avgTtl: 920_311 },
      { db: 'db2', keys: 6_299, expires: 5_625, avgTtl: 1_251_695 },
      { db: 'db3', keys: 32_738, expires: 805, avgTtl: 13_237_262 },
      { db: 'db4', keys: 6, expires: 6, avgTtl: 1_090_136_464 },
      { db: 'db5', keys: 12, expires: 9, avgTtl: 5_903 },
      { db: 'db6', keys: 1, expires: 0, avgTtl: 0 },
      { db: 'db7', keys: 71_512, expires: 71_512, avgTtl: 65_621_38 },
      { db: 'db9', keys: 1, expires: 0, avgTtl: 0 },
      { db: 'db10', keys: 11, expires: 6, avgTtl: 77_700 },
      { db: 'db11', keys: 142_398, expires: 134_002, avgTtl: 92_711 },
      { db: 'db12', keys: 8_211, expires: 2_100, avgTtl: 1_842_001 },
    ],
    slowlogLen: 18,
    hitRate: hits / (hits + misses),
    topCommands: [
      { name: 'get', calls: 418_293_201, usecPerCall: 1.47 },
      { name: 'set', calls: 128_392_011, usecPerCall: 2.98 },
      { name: 'hgetall', calls: 88_201_932, usecPerCall: 3.0 },
      { name: 'scan', calls: 1_823_921, usecPerCall: 27.02 },
      { name: 'expire', calls: 992_101, usecPerCall: 3.01 },
      { name: 'del', calls: 432_102, usecPerCall: 2.97 },
    ],
    replication: {
      role: 'master',
      connectedSlaves: 1,
      masterHost: null,
      masterPort: null,
      masterLinkStatus: null,
      replOffset: 184_293_821,
    },
    sections,
    sampledAt: Date.now(),
  }
}

export function mockHistory(base: Overview): {
  ts: number
  ops: number
  memory: number
  clients: number
  hitRate: number
}[] {
  const points = 44
  return Array.from({ length: points }, (_, i) => {
    const wave = Math.sin(i / 5) * 0.18 + Math.sin(i / 2.3) * 0.06
    const ramp = (i / points) * 0.1
    return {
      ts: Date.now() - (points - i) * 5000,
      ops: Math.max(800, Math.round(base.opsPerSec * (1 + wave + ramp - 0.1))),
      memory: Math.round(base.usedMemory * (0.93 + ramp * 0.6 + Math.sin(i / 7) * 0.012)),
      clients: Math.max(30, Math.round(base.connectedClients + Math.sin(i / 6) * 5)),
      hitRate: Math.min(0.999, base.hitRate - 0.008 + Math.sin(i / 8) * 0.004),
    }
  })
}

function view(): ConnectionView[] {
  return connections.map((c) => ({
    ...c,
    connected: connected.has(c.id),
    serverVersion: connected.has(c.id) ? '8.0.1' : null,
  }))
}

function requireKey(key: string): MockKey {
  const entry = keys.get(key)
  if (!entry) throw new Error('Key 不存在或已过期')
  return entry
}

function stringValue(value: string): ConsoleValue {
  return { kind: 'bulk', value, bytes: bytesOf(value), binary: false }
}

function arrayValue(values: string[]): ConsoleValue {
  return { kind: 'array', value: values.map(stringValue) }
}

function slowlogData(): SlowLogEntry[] {
  const entries = [
    {
      durationUs: 184_320,
      args: ['KEYS', 'order:20261116:*'],
      client: '10.20.0.18:52214',
      name: 'report-worker',
    },
    {
      durationUs: 92_140,
      args: ['HGETALL', 'cache:homepage:feed'],
      client: '10.20.0.22:41882',
      name: 'api-gateway',
    },
    {
      durationUs: 41_882,
      args: ['SCAN', '0', 'MATCH', 'session:*', 'COUNT', '10000'],
      client: '10.20.0.31:60214',
      name: '',
    },
    {
      durationUs: 22_310,
      args: ['ZRANGE', 'leaderboard:weekly', '0', '-1', 'WITHSCORES'],
      client: '10.20.0.22:41910',
      name: 'api-gateway',
    },
    {
      durationUs: 12_880,
      args: ['SET', 'cache:homepage:feed', '{"sections":[...]}', 'EX', '300'],
      client: '10.20.0.41:38012',
      name: 'cms',
    },
    {
      durationUs: 8_140,
      args: ['SMEMBERS', 'permission:role:admin'],
      client: '10.20.0.18:52230',
      name: 'report-worker',
    },
  ]
  return entries.map((e, i) => ({
    id: 1832 - i,
    timestamp: Math.floor(Date.now() / 1000) - i * 137 - 40,
    durationUs: e.durationUs,
    args: e.args,
    client: e.client,
    clientName: e.name,
  }))
}

function clientRows(): ClientRow[] {
  return [
    { id: '128', addr: '10.20.0.22:41882', name: 'api-gateway', age: 88231, idle: 0, db: 0, cmd: 'hgetall', user: 'default', flags: 'N' },
    { id: '131', addr: '10.20.0.22:41910', name: 'api-gateway', age: 88230, idle: 1, db: 0, cmd: 'get', user: 'default', flags: 'N' },
    { id: '142', addr: '10.20.0.18:52214', name: 'report-worker', age: 42120, idle: 0, db: 0, cmd: 'scan', user: 'report', flags: 'N' },
    { id: '155', addr: '10.20.0.41:38012', name: 'cms', age: 29121, idle: 12, db: 0, cmd: 'set', user: 'default', flags: 'N' },
    { id: '160', addr: '10.20.0.51:22011', name: 'queue-worker', age: 12880, idle: 0, db: 0, cmd: 'blpop', user: 'queue', flags: 'b' },
    { id: '171', addr: '10.20.0.51:22018', name: 'queue-worker', age: 12870, idle: 0, db: 0, cmd: 'blpop', user: 'queue', flags: 'b' },
    { id: '188', addr: '10.20.0.66:51231', name: 'rill', age: 312, idle: 0, db: 0, cmd: 'client|list', user: 'default', flags: 'N' },
  ]
}

function commandResponse(line: string): ConsoleResult {
  const parts = line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((p) => p.replace(/^["']|["']$/g, '')) ?? []
  const [rawCmd, ...args] = parts
  const cmd = (rawCmd || '').toUpperCase()
  const output = (value: ConsoleValue): ConsoleValue => value
  let value: ConsoleValue = { kind: 'status', value: 'OK' }
  const started = performance.now()

  switch (cmd) {
    case 'PING':
      value = { kind: 'status', value: 'PONG' }
      break
    case 'ECHO':
      value = stringValue(args[0] ?? '')
      break
    case 'DBSIZE':
      value = { kind: 'int', value: keys.size }
      break
    case 'TYPE':
      value = { kind: 'status', value: keys.get(args[0])?.type ?? 'none' }
      break
    case 'TTL':
      value = { kind: 'int', value: keys.get(args[0])?.ttl ?? -2 }
      break
    case 'EXISTS':
      value = { kind: 'int', value: args.filter((k) => keys.has(k)).length }
      break
    case 'GET': {
      const entry = keys.get(args[0])
      value = entry?.type === 'string' ? stringValue(entry.string ?? '') : entry ? { kind: 'status', value: 'WRONGTYPE Operation against a key holding the wrong kind of value' } : { kind: 'nil' }
      break
    }
    case 'SET': {
      const key = args[0]
      const val = args[1] ?? ''
      if (!key) throw new Error('wrong number of arguments for SET')
      addString(key, val)
      value = { kind: 'status', value: 'OK' }
      break
    }
    case 'DEL': {
      let count = 0
      for (const key of args) if (keys.delete(key)) count++
      value = { kind: 'int', value: count }
      break
    }
    case 'KEYS': {
      const re = globToRegex(args[0] ?? '*')
      value = arrayValue([...keys.keys()].filter((k) => re.test(k)))
      break
    }
    case 'SCAN': {
      const matchIdx = args.findIndex((a) => a.toUpperCase() === 'MATCH')
      const pattern = matchIdx >= 0 ? args[matchIdx + 1] : '*'
      const typeIdx = args.findIndex((a) => a.toUpperCase() === 'TYPE')
      const type = typeIdx >= 0 ? args[typeIdx + 1] : ''
      const re = globToRegex(pattern || '*')
      const found = [...keys.entries()]
        .filter(([k, v]) => re.test(k) && (!type || v.type === type))
        .map(([k]) => k)
      value = { kind: 'array', value: [stringValue('0'), { kind: 'array', value: found.map(stringValue) }] }
      break
    }
    case 'HGETALL': {
      const entry = keys.get(args[0])
      value = entry?.hash ? arrayValue(entry.hash.flat()) : { kind: 'array', value: [] }
      break
    }
    case 'HGET': {
      const entry = keys.get(args[0])
      const hit = entry?.hash?.find(([f]) => f === args[1])
      value = hit ? stringValue(hit[1]) : { kind: 'nil' }
      break
    }
    case 'HSET': {
      const entry = keys.get(args[0])
      if (entry?.hash) {
        const existing = entry.hash.find(([f]) => f === args[1])
        if (existing) existing[1] = args[2] ?? ''
        else entry.hash.push([args[1] ?? '', args[2] ?? ''])
      } else {
        addHash(args[0], [[args[1] ?? '', args[2] ?? '']])
      }
      value = { kind: 'int', value: 1 }
      break
    }
    case 'LRANGE': {
      const entry = keys.get(args[0])
      const start = Number(args[1] ?? 0)
      const stop = Number(args[2] ?? -1)
      const list = entry?.list ?? []
      const end = stop < 0 ? list.length + stop + 1 : stop + 1
      value = arrayValue(list.slice(start, end))
      break
    }
    case 'LLEN':
      value = { kind: 'int', value: keys.get(args[0])?.list?.length ?? 0 }
      break
    case 'SMEMBERS':
      value = arrayValue(keys.get(args[0])?.set ?? [])
      break
    case 'SCARD':
      value = { kind: 'int', value: keys.get(args[0])?.set?.length ?? 0 }
      break
    case 'ZRANGE': {
      const entry = keys.get(args[0])
      const start = Number(args[1] ?? 0)
      const stop = Number(args[2] ?? -1)
      const all = [...(entry?.zset ?? [])].sort((a, b) => a.score - b.score)
      const end = stop < 0 ? all.length + stop + 1 : stop + 1
      const sliced = all.slice(start, end)
      const withScores = args.some((a) => a.toUpperCase() === 'WITHSCORES')
      value = arrayValue(withScores ? sliced.flatMap((z) => [z.member, String(z.score)]) : sliced.map((z) => z.member))
      break
    }
    case 'ZCARD':
      value = { kind: 'int', value: keys.get(args[0])?.zset?.length ?? 0 }
      break
    case 'XLEN':
      value = { kind: 'int', value: keys.get(args[0])?.stream?.length ?? 0 }
      break
    case 'INFO':
      value = stringValue(
        `# Server\r\nredis_version:8.0.1\r\nredis_mode:standalone\r\nos:Linux 6.8.0-45-generic x86_64\r\nuptime_in_seconds:3312042\r\n\r\n# Clients\r\nconnected_clients:42\r\n\r\n# Memory\r\nused_memory:1975684956\r\nused_memory_human:1.84G\r\nmaxmemory:4294967296\r\nmaxmemory_policy:allkeys-lru\r\n\r\n# Stats\r\ninstantaneous_ops_per_sec:12480\r\nkeyspace_hits:1284932201\r\nkeyspace_misses:35982112\r\n\r\n# Keyspace\r\ndb0:keys=982341,expires=18322,avg_ttl=1840293\r\n`,
      )
      break
    case 'SLOWLOG':
      if ((args[0] || '').toUpperCase() === 'LEN') value = { kind: 'int', value: 18 }
      else value = { kind: 'array', value: [] }
      break
    case 'CLIENT':
      if ((args[0] || '').toUpperCase() === 'LIST') {
        value = stringValue(
          clientRows()
            .map((c) => `id=${c.id} addr=${c.addr} name=${c.name} age=${c.age} idle=${c.idle} db=${c.db} cmd=${c.cmd} user=${c.user} flags=${c.flags}`)
            .join('\n'),
        )
      }
      break
    case 'COMMAND':
      value = { kind: 'array', value: [] }
      break
    case 'FLUSHALL':
    case 'FLUSHDB':
      keys.clear()
      value = { kind: 'status', value: 'OK' }
      break
    default:
      value = { kind: 'status', value: 'OK' }
  }

  return {
    command: line.trim(),
    elapsedMs: Math.max(0.1, performance.now() - started + Math.random() * 0.8),
    value: output(value),
  }
}

export const mockApi = {
  isMock: true,

  async listConnections(): Promise<ConnectionView[]> {
    await sleep(30)
    return view()
  },

  async saveConnection(input: SaveConnectionInput): Promise<ConnectionConfig> {
    await sleep(160)
    const cfg = { ...input.connection }
    if (!cfg.id) {
      cfg.id = `mock-${Date.now()}`
      cfg.createdAt = Date.now()
    }
    if (input.clearPassword) cfg.hasPassword = false
    else if (input.password) cfg.hasPassword = true
    const idx = connections.findIndex((c) => c.id === cfg.id)
    if (idx >= 0) connections[idx] = cfg
    else connections = [cfg, ...connections]
    return cfg
  },

  async deleteConnection(id: string): Promise<void> {
    await sleep(80)
    connections = connections.filter((c) => c.id !== id)
    connected.delete(id)
  },

  async testConnection(input: { connection: ConnectionConfig; password?: string }): Promise<TestConnectionResult> {
    await sleep(520)
    if (!input.connection.host) {
      return { ok: false, latencyMs: 0, version: null, message: '请填写主机地址' }
    }
    if (input.connection.host.includes('bad')) {
      return { ok: false, latencyMs: 0, version: null, message: '连接失败: Connection refused (os error 61)' }
    }
    return {
      ok: true,
      latencyMs: 3.8,
      version: '8.0.1',
      message: '连接成功 · 3.8 ms',
    }
  },

  async connect(id: string): Promise<ConnectResult> {
    await sleep(360)
    if (!connections.some((c) => c.id === id)) throw new Error('连接不存在')
    connected.add(id)
    return { version: '8.0.1', latencyMs: 3.6 }
  },

  async disconnect(id: string): Promise<void> {
    await sleep(40)
    connected.delete(id)
  },

  async listDatabases(_id: string): Promise<DatabaseEntry[]> {
    await sleep(70)
    const entries = [...keys.keys()]
    return Array.from({ length: 16 }, (_, index) => {
      const count =
        index === 0
          ? entries.length
          : entries.filter((_, entryIndex) => entryIndex % 16 === index).length
      return { index, keys: count, expires: 0 }
    })
  },

  async switchDb(_id: string, db: number): Promise<SwitchDbResult> {
    await sleep(90)
    mockCurrentDb = db
    const entries = [...keys.keys()]
    const count =
      db === 0 ? entries.length : entries.filter((_, entryIndex) => entryIndex % 16 === db).length
    return { db, keys: count }
  },

  async overview(_id: string): Promise<Overview> {
    await sleep(60)
    return overviewData()
  },

  async scanKeys(
    _id: string,
    cursor: number,
    pattern?: string,
    typeFilter?: string,
    count = 200,
  ): Promise<ScanPage> {
    await sleep(90)
    const re = globToRegex(pattern && pattern !== '*' ? pattern : '*')
    const all: KeyMeta[] = []
    const entries = [...keys.entries()]
    for (let index = 0; index < entries.length; index++) {
      const [key, entry] = entries[index]
      if (mockCurrentDb !== 0 && index % 16 !== mockCurrentDb) continue
      if (!re.test(key)) continue
      if (typeFilter && typeFilter !== 'all' && entry.type !== typeFilter) continue
      all.push({ key, keyType: entry.type, ttl: entry.ttl, size: entry.size })
    }
    const offset = cursor
    const page = all.slice(offset, offset + count)
    const next = offset + page.length
    return { keys: page, cursor: next >= all.length ? 0 : next, done: next >= all.length }
  },

  async namespaceTree(
    _id: string,
    pattern?: string,
    _maxKeys = 100_000,
    cursor = 0,
    _budgetMs = 2000,
  ): Promise<NamespaceTreeResult> {
    await sleep(60)
    const matcher = globToRegex(pattern && pattern !== '*' ? pattern : '*')
    const selected = [...keys.entries()]
      .filter((_, index) => mockCurrentDb === 0 || index % 16 === mockCurrentDb)
      .map(([key]) => key)
      .filter((key) => matcher.test(key))
    const chunkSize = 220
    const start = Math.max(0, cursor)
    const slice = selected.slice(start, start + chunkSize)
    const next = start + slice.length
    const counts = new Map<string, number>()
    const directCounts = new Map<string, number>()
    let rootKeys = 0
    for (const key of slice) {
      let hasPrefix = false
      let lastSeparator = -1
      for (let index = 1; index < key.length - 1; index++) {
        if (key[index] === ':') {
          const path = key.slice(0, index)
          if (path && !path.endsWith(':')) {
            counts.set(path, (counts.get(path) ?? 0) + 1)
            hasPrefix = true
            lastSeparator = index
          }
        }
      }
      if (lastSeparator > 0) {
        const parent = key.slice(0, lastSeparator)
        if (parent) directCounts.set(parent, (directCounts.get(parent) ?? 0) + 1)
      } else if (!hasPrefix) {
        rootKeys++
      }
    }
    return {
      entries: [...counts.entries()]
        .map(([path, count]) => ({
          path,
          name: path.slice(path.lastIndexOf(':') + 1),
          depth: path.split(':').length,
          count,
          direct: directCounts.get(path) ?? 0,
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
      scanned: slice.length,
      rootKeys,
      truncated: false,
      cursor: next >= selected.length ? 0 : next,
      done: next >= selected.length,
      totalKeys: selected.length,
    }
  },

  async prefixKeys(
    _id: string,
    prefix: string,
    cursor: number,
    count = 200,
  ): Promise<ScanPage> {
    await sleep(60)
    const depth = prefix.split(':').filter(Boolean).length + 1
    const direct = [...keys.entries()]
      .filter((_, index) => mockCurrentDb === 0 || index % 16 === mockCurrentDb)
      .filter(
        ([key]) =>
          key.startsWith(`${prefix}:`) &&
          key.split(':').filter(Boolean).length === depth,
      )
    const offset = cursor
    const page = direct.slice(offset, offset + count)
    const next = offset + page.length
    return {
      keys: page.map(([key, entry]) => ({
        key,
        keyType: entry.type,
        ttl: entry.ttl,
        size: entry.size,
      })),
      cursor: next >= direct.length ? 0 : next,
      done: next >= direct.length,
    }
  },

  async keyDetail(_id: string, key: string, count = 100): Promise<KeyDetail> {
    await sleep(70)
    const entry = requireKey(key)
    return {
      meta: { key, keyType: entry.type, ttl: entry.ttl, size: entry.size },
      encoding: entry.type === 'hash' ? 'listpack' : entry.type === 'string' ? 'embstr' : 'quicklist',
      length:
        entry.type === 'string'
          ? bytesOf(entry.string ?? '')
          : entry.type === 'hash'
            ? entry.hash?.length ?? 0
            : entry.type === 'list'
              ? entry.list?.length ?? 0
              : entry.type === 'set'
                ? entry.set?.length ?? 0
                : entry.type === 'zset'
                  ? entry.zset?.length ?? 0
                  : entry.stream?.length ?? 0,
      value: pageFor(entry, '0', count),
    }
  },

  async keyPage(
    _id: string,
    key: string,
    _type: string,
    cursor: string,
    count = 100,
  ): Promise<ValueData> {
    await sleep(50)
    return pageFor(requireKey(key), cursor, count)
  },

  async setString(_id: string, key: string, value: string): Promise<void> {
    await sleep(60)
    addString(key, value, keys.get(key)?.ttl ?? -1)
  },

  async hashSet(_id: string, key: string, field: string, value: string): Promise<void> {
    await sleep(60)
    const entry = keys.get(key) ?? { type: 'hash' as RedisType, ttl: -1, size: 0, hash: [] }
    entry.hash = entry.hash ?? []
    const hit = entry.hash.find(([f]) => f === field)
    if (hit) hit[1] = value
    else entry.hash.push([field, value])
    keys.set(key, entry)
  },

  async hashDel(_id: string, key: string, field: string): Promise<void> {
    await sleep(60)
    const entry = keys.get(key)
    if (entry?.hash) entry.hash = entry.hash.filter(([f]) => f !== field)
  },

  async listSet(_id: string, key: string, index: number, value: string): Promise<void> {
    await sleep(60)
    const entry = requireKey(key)
    if (entry.list) entry.list[index] = value
  },

  async listPush(_id: string, key: string, value: string, left = false): Promise<void> {
    await sleep(60)
    const entry = keys.get(key) ?? { type: 'list' as RedisType, ttl: -1, size: 0, list: [] }
    entry.list = entry.list ?? []
    if (left) entry.list.unshift(value)
    else entry.list.push(value)
    keys.set(key, entry)
  },

  async listRemove(_id: string, key: string, value: string): Promise<void> {
    await sleep(60)
    const entry = keys.get(key)
    if (entry?.list) {
      const idx = entry.list.indexOf(value)
      if (idx >= 0) entry.list.splice(idx, 1)
    }
  },

  async setAdd(_id: string, key: string, member: string): Promise<void> {
    await sleep(60)
    const entry = keys.get(key) ?? { type: 'set' as RedisType, ttl: -1, size: 0, set: [] }
    entry.set = entry.set ?? []
    if (!entry.set.includes(member)) entry.set.push(member)
    keys.set(key, entry)
  },

  async setRemove(_id: string, key: string, member: string): Promise<void> {
    await sleep(60)
    const entry = keys.get(key)
    if (entry?.set) entry.set = entry.set.filter((m) => m !== member)
  },

  async zsetAdd(_id: string, key: string, member: string, score: number): Promise<void> {
    await sleep(60)
    const entry = keys.get(key) ?? { type: 'zset' as RedisType, ttl: -1, size: 0, zset: [] }
    entry.zset = entry.zset ?? []
    const hit = entry.zset.find((z) => z.member === member)
    if (hit) hit.score = score
    else entry.zset.push({ member, score })
    keys.set(key, entry)
  },

  async zsetRemove(_id: string, key: string, member: string): Promise<void> {
    await sleep(60)
    const entry = keys.get(key)
    if (entry?.zset) entry.zset = entry.zset.filter((z) => z.member !== member)
  },

  async createKey(_id: string, key: string, kind: string): Promise<void> {
    await sleep(60)
    if (keys.has(key)) throw new Error('Key 已存在')
    if (kind === 'string') addString(key, '')
    else if (kind === 'hash') addHash(key, [['field', '']])
    else if (kind === 'list') addList(key, ['value'])
    else if (kind === 'set') addSet(key, ['value'])
    else if (kind === 'zset') addZSet(key, [{ member: 'member', score: 0 }])
    else if (kind === 'stream') addStream(key, [{ id: `${nowSec()}000-0`, fields: [['field', '']] }])
  },

  async deleteKey(_id: string, key: string): Promise<void> {
    await sleep(60)
    keys.delete(key)
  },

  async renameKey(_id: string, from: string, to: string): Promise<void> {
    await sleep(60)
    const entry = requireKey(from)
    keys.delete(from)
    keys.set(to, entry)
  },

  async expireKey(_id: string, key: string, seconds: number): Promise<void> {
    await sleep(60)
    const entry = requireKey(key)
    entry.ttl = seconds
  },

  async persistKey(_id: string, key: string): Promise<void> {
    await sleep(60)
    const entry = requireKey(key)
    entry.ttl = -1
  },

  async analyze(_id: string): Promise<AnalysisResult> {
    await sleep(420)
    const entries = [...keys.entries()]
    const totalBytes = entries.reduce((acc, [, v]) => acc + v.size, 0)
    const byPrefix = new Map<string, { bytes: number; keys: number }>()
    for (const [k, v] of entries) {
      const prefix = keyPrefix(k)
      const cur = byPrefix.get(prefix) ?? { bytes: 0, keys: 0 }
      cur.bytes += v.size
      cur.keys += 1
      byPrefix.set(prefix, cur)
    }
    return {
      scanned: entries.length,
      totalBytes,
      topKeys: entries
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, 12)
        .map(([key, v]) => ({ key, keyType: v.type, bytes: v.size })),
      prefixes: [...byPrefix.entries()]
        .sort((a, b) => b[1].bytes - a[1].bytes)
        .slice(0, 10)
        .map(([prefix, v]) => ({ prefix, bytes: v.bytes, keys: v.keys })),
    }
  },

  async execute(_id: string, command: string): Promise<ConsoleResult> {
    await sleep(45)
    return commandResponse(command)
  },

  async slowlog(_id: string, _count = 128): Promise<SlowLogEntry[]> {
    await sleep(80)
    return slowlogData()
  },

  async slowlogReset(_id: string): Promise<void> {
    await sleep(60)
  },

  async clients(_id: string): Promise<ClientRow[]> {
    await sleep(80)
    return clientRows()
  },

  async pubsubChannels(_id: string): Promise<string[]> {
    await sleep(60)
    return ['notifications', 'order.events', 'cache.invalidate', 'audit.log']
  },

  async pubsubStart(_id: string, channels: string[]): Promise<string[]> {
    await sleep(80)
    return channels
  },

  async pubsubStop(_id: string): Promise<void> {
    await sleep(20)
  },
}

export function mockOverviewHistory() {
  return mockHistory(overviewData())
}

