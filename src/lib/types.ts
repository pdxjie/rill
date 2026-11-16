export type RedisType =
  | 'string'
  | 'hash'
  | 'list'
  | 'set'
  | 'zset'
  | 'stream'
  | 'none'
  | 'unknown'

export type Env = 'production' | 'staging' | 'development' | 'local'

export interface SshConfig {
  host: string
  port: number
  user: string
  keyPath?: string | null
}

export interface ConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  db: number
  username?: string | null
  tls: boolean
  tlsInsecure: boolean
  ssh?: SshConfig | null
  color: string
  env: Env | string
  readOnly: boolean
  hasPassword: boolean
  createdAt: number
  lastUsedAt: number
}

export interface ConnectionView extends ConnectionConfig {
  connected: boolean
  serverVersion?: string | null
}

export interface TestConnectionResult {
  ok: boolean
  latencyMs: number
  version?: string | null
  message: string
}

export interface ConnectResult {
  version: string
  latencyMs: number
}

export interface KeyMeta {
  key: string
  keyType: RedisType
  ttl: number
  size?: number
}

export interface ScanPage {
  keys: KeyMeta[]
  cursor: number
  done: boolean
}

export interface FieldValue {
  field: string
  value: string
}

export interface IndexedValue {
  index: number
  value: string
}

export interface ScoredValue {
  member: string
  score: number
}

export interface StreamEntry {
  id: string
  fields: FieldValue[]
}

export type ValueData =
  | {
      kind: 'string'
      text: string
      bytes: number
      truncated: boolean
      binary: boolean
    }
  | {
      kind: 'hash'
      items: FieldValue[]
      cursor: number
      done: boolean
      total: number
    }
  | {
      kind: 'list'
      items: IndexedValue[]
      nextStart: number
      done: boolean
      total: number
    }
  | {
      kind: 'set'
      items: string[]
      cursor: number
      done: boolean
      total: number
    }
  | {
      kind: 'zset'
      items: ScoredValue[]
      cursor: number
      done: boolean
      total: number
    }
  | {
      kind: 'stream'
      entries: StreamEntry[]
      lastId: string
      done: boolean
      total: number
    }
  | { kind: 'unsupported'; note: string }

export interface NamespaceEntry {
  path: string
  name: string
  depth: number
  count: number
  direct: number
}

export interface NamespaceTreeResult {
  entries: NamespaceEntry[]
  scanned: number
  rootKeys: number
  truncated: boolean
}

export interface KeyDetail {
  meta: KeyMeta
  encoding?: string | null
  length: number
  value: ValueData
}

export interface DatabaseEntry {
  index: number
  keys: number
  expires: number
}

export interface SwitchDbResult {
  db: number
  keys: number
}

export interface DbInfo {
  db: string
  keys: number
  expires: number
  avgTtl: number
}

export interface CmdStat {
  name: string
  calls: number
  usecPerCall: number
}

export interface ReplicationInfo {
  role: string
  connectedSlaves: number
  masterHost?: string | null
  masterPort?: number | null
  masterLinkStatus?: string | null
  replOffset?: number | null
}

export interface InfoItem {
  key: string
  value: string
}

export interface InfoSection {
  name: string
  items: InfoItem[]
}

export interface Overview {
  version: string
  mode: string
  role: string
  os: string
  uptimeSecs: number
  connectedClients: number
  usedMemory: number
  usedMemoryPeak: number
  maxMemory: number
  maxmemoryPolicy: string
  memFragmentationRatio: number
  totalConnectionsReceived: number
  totalCommandsProcessed: number
  opsPerSec: number
  keyspaceHits: number
  keyspaceMisses: number
  expiredKeys: number
  evictedKeys: number
  rejectedConnections: number
  netInputBytes: number
  netOutputBytes: number
  rdbLastSaveTime: number
  aofEnabled: boolean
  dbsize: number
  dbs: DbInfo[]
  slowlogLen: number
  hitRate: number
  topCommands: CmdStat[]
  replication: ReplicationInfo
  sections: InfoSection[]
  sampledAt: number
}

export interface SlowLogEntry {
  id: number
  timestamp: number
  durationUs: number
  args: string[]
  client: string
  clientName: string
}

export interface ClientRow {
  id: string
  addr: string
  name: string
  age: number
  idle: number
  db: number
  cmd: string
  user: string
  flags: string
}

export type ConsoleValue =
  | { kind: 'nil' }
  | { kind: 'int'; value: number }
  | { kind: 'status'; value: string }
  | { kind: 'bulk'; value: string; bytes: number; binary: boolean }
  | { kind: 'array'; value: ConsoleValue[] }
  | { kind: 'map'; value: [ConsoleValue, ConsoleValue][] }
  | { kind: 'double'; value: number }
  | { kind: 'bool'; value: boolean }

export interface ConsoleResult {
  command: string
  elapsedMs: number
  value: ConsoleValue
}

export interface PubSubMessage {
  channel: string
  payload: string
  pattern?: string | null
  ts: number
}

export interface KeyMemory {
  key: string
  keyType: RedisType
  bytes: number
}

export interface PrefixMemory {
  prefix: string
  bytes: number
  keys: number
}

export interface AnalysisResult {
  scanned: number
  totalBytes: number
  topKeys: KeyMemory[]
  prefixes: PrefixMemory[]
}

export type WorkspaceTab =
  | 'overview'
  | 'keys'
  | 'console'
  | 'slowlog'
  | 'pubsub'
  | 'info'

export interface SaveConnectionInput {
  connection: ConnectionConfig
  password?: string
  clearPassword?: boolean
}
