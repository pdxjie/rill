import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { mockApi } from './mock'
import type {
  AnalysisResult,
  ClientRow,
  ConnectResult,
  ConnectionConfig,
  ConnectionView,
  ConsoleResult,
  DatabaseEntry,
  KeyDetail,
  NamespaceTreeResult,
  Overview,
  PubSubMessage,
  SaveConnectionInput,
  ScanPage,
  SlowLogEntry,
  SwitchDbResult,
  TestConnectionResult,
  ValueData,
} from './types'

export const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

const params =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams()

export const isMock = !isTauri || params.get('mock') === '1'

export const appParams = params

export interface RillApi {
  listConnections(): Promise<ConnectionView[]>
  saveConnection(input: SaveConnectionInput): Promise<ConnectionConfig>
  deleteConnection(id: string): Promise<void>
  testConnection(input: {
    connection: ConnectionConfig
    password?: string
  }): Promise<TestConnectionResult>
  connect(id: string): Promise<ConnectResult>
  disconnect(id: string): Promise<void>
  listDatabases(id: string): Promise<DatabaseEntry[]>
  switchDb(id: string, db: number): Promise<SwitchDbResult>
  overview(id: string): Promise<Overview>
  scanKeys(
    id: string,
    cursor: number,
    pattern?: string,
    typeFilter?: string,
    count?: number,
  ): Promise<ScanPage>
  namespaceTree(
    id: string,
    pattern?: string,
    maxKeys?: number,
    cursor?: number,
    budgetMs?: number,
  ): Promise<NamespaceTreeResult>
  prefixKeys(
    id: string,
    prefix: string,
    cursor: number,
    count?: number,
  ): Promise<ScanPage>
  keyDetail(id: string, key: string, count?: number): Promise<KeyDetail>
  keyPage(
    id: string,
    key: string,
    keyType: string,
    cursor: string,
    count?: number,
  ): Promise<ValueData>
  setString(id: string, key: string, value: string, ttl?: number | null): Promise<void>
  hashSet(id: string, key: string, field: string, value: string): Promise<void>
  hashDel(id: string, key: string, field: string): Promise<void>
  listSet(id: string, key: string, index: number, value: string): Promise<void>
  listPush(id: string, key: string, value: string, left?: boolean): Promise<void>
  listRemove(id: string, key: string, value: string): Promise<void>
  setAdd(id: string, key: string, member: string): Promise<void>
  setRemove(id: string, key: string, member: string): Promise<void>
  zsetAdd(id: string, key: string, member: string, score: number): Promise<void>
  zsetRemove(id: string, key: string, member: string): Promise<void>
  createKey(id: string, key: string, kind: string): Promise<void>
  deleteKey(id: string, key: string): Promise<void>
  renameKey(id: string, from: string, to: string): Promise<void>
  expireKey(id: string, key: string, seconds: number): Promise<void>
  persistKey(id: string, key: string): Promise<void>
  analyze(id: string, limit?: number): Promise<AnalysisResult>
  execute(id: string, command: string): Promise<ConsoleResult>
  slowlog(id: string, count?: number): Promise<SlowLogEntry[]>
  slowlogReset(id: string): Promise<void>
  clients(id: string): Promise<ClientRow[]>
  pubsubChannels(id: string): Promise<string[]>
  pubsubStart(id: string, channels: string[]): Promise<string[]>
  pubsubStop(id: string): Promise<void>
}

const real: RillApi = {
  listConnections: () => invoke('list_connections'),
  saveConnection: (input) => invoke('save_connection', { input }),
  deleteConnection: (id) => invoke('delete_connection', { id }),
  testConnection: (input) => invoke('test_connection', { input }),
  connect: (id) => invoke('connect', { id }),
  disconnect: (id) => invoke('disconnect', { id }),
  listDatabases: (id) => invoke('list_databases', { id }),
  switchDb: (id, db) => invoke('switch_db', { id, db }),
  overview: (id) => invoke('overview', { id }),
  scanKeys: (id, cursor, pattern, typeFilter, count) =>
    invoke('scan_keys', { id, cursor, pattern, typeFilter, count }),
  namespaceTree: (id, pattern, maxKeys, cursor, budgetMs) =>
    invoke('namespace_tree', { id, pattern, maxKeys, cursor, budgetMs }),
  prefixKeys: (id, prefix, cursor, count) =>
    invoke('prefix_keys', { id, prefix, cursor, count }),
  keyDetail: (id, key, count) => invoke('key_detail', { id, key, count }),
  keyPage: (id, key, keyType, cursor, count) =>
    invoke('key_page', { id, key, keyType, cursor, count }),
  setString: (id, key, value, ttl) => invoke('set_string', { id, key, value, ttl }),
  hashSet: (id, key, field, value) => invoke('hash_set', { id, key, field, value }),
  hashDel: (id, key, field) => invoke('hash_del', { id, key, field }),
  listSet: (id, key, index, value) => invoke('list_set', { id, key, index, value }),
  listPush: (id, key, value, left) => invoke('list_push', { id, key, value, left }),
  listRemove: (id, key, value) => invoke('list_remove', { id, key, value }),
  setAdd: (id, key, member) => invoke('set_add', { id, key, member }),
  setRemove: (id, key, member) => invoke('set_remove', { id, key, member }),
  zsetAdd: (id, key, member, score) => invoke('zset_add', { id, key, member, score }),
  zsetRemove: (id, key, member) => invoke('zset_remove', { id, key, member }),
  createKey: (id, key, kind) => invoke('create_key', { id, key, kind }),
  deleteKey: (id, key) => invoke('delete_key', { id, key }),
  renameKey: (id, from, to) => invoke('rename_key', { id, from, to }),
  expireKey: (id, key, seconds) => invoke('expire_key', { id, key, seconds }),
  persistKey: (id, key) => invoke('persist_key', { id, key }),
  analyze: (id, limit) => invoke('analyze', { id, limit }),
  execute: (id, command) => invoke('execute', { id, command }),
  slowlog: (id, count) => invoke('slowlog', { id, count }),
  slowlogReset: (id) => invoke('slowlog_reset', { id }),
  clients: (id) => invoke('clients', { id }),
  pubsubChannels: (id) => invoke('pubsub_channels', { id }),
  pubsubStart: (id, channels) => invoke('pubsub_start', { id, channels }),
  pubsubStop: (id) => invoke('pubsub_stop', { id }),
}

export const api: RillApi = isMock ? (mockApi as unknown as RillApi) : real

export function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return '未知错误'
}

export async function onPubSubMessage(
  callback: (message: PubSubMessage) => void,
): Promise<UnlistenFn> {
  if (isMock) return () => undefined
  return listen<PubSubMessage>('pubsub://message', (event) => callback(event.payload))
}
