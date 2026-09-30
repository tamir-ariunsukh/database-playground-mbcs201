'use client'

import type { DomainDefinition } from '../schema/types'
import { getDomains } from '../schema'
import type { DbKind, QueryResult, TableMeta } from '../types'
import { QueryError } from '../types'
import {
  getPGlite,
  getPostgresSchema,
  resetPostgres,
  runPostgres,
  runPostgresScript,
} from './pglite'
import { clearAlasql, createAlasqlTable, runMysql } from './mysql'
import { extractPGliteToMongo, runMongo, setMongoCollections, type MongoCollections } from './mongo'

/**
 * VirtualDatabase — нэг domain-ийг 3 системд зэрэгцүүлэн ажиллуулдаг facade.
 *
 * Архитектур:
 *   1. Domain-ийг сонгоход PostgreSQL (PGlite) дээр DDL + seed ажиллуулна.
 *   2. Тэр датаг автоматаар MySQL (alasql) болон MongoDB (mingo) руу хуулна.
 *      → 3 системд ЯГ ИЖИЛ дата байна.
 *   3. Хэрэглэгч аль системийг сонгож query бичнэ.
 *   4. Reset дарахад бүгд анхны байдалд буцна.
 *
 * Яагаад Postgres нь "эх сурвалж" вэ:
 *   PGlite нь жинхэнэ PostgreSQL тул DDL, constraint, serial,
 *   default утгуудыг зөв боловсруулна. Түүнээс датаг хуулбал
 *   бусад системд ч зөв, бодит дата очно.
 */

export interface EngineStatus {
  postgres: 'idle' | 'loading' | 'ready' | 'error'
  mysql: 'idle' | 'loading' | 'ready' | 'error'
  mongodb: 'idle' | 'loading' | 'ready' | 'error'
}

export interface DatabaseSnapshot {
  domainId: string
  tables: TableMeta[]
  /** Монгол хэл дээрх тайлбар — engine бүрт өөр. */
  engineLabels: Record<DbKind, string>
}

let currentDomain: DomainDefinition | null = null
let currentSnapshot: DatabaseSnapshot | null = null
let mongoStore: MongoCollections = {}

/*
 * Зэрэгцээ дуудалтаас хамгаалах lock.
 *
 * React StrictMode (development) нь effect-ийг ХОЁР удаа дууддаг.
 * Хэрэв хоёр `loadDomain` зэрэг ажиллавал нэг нь DROP хийж байхад
 * нөгөө нь CREATE хийж, "relation already exists" алдаа гарна.
 * Тиймээс ижил domain-д нэг л promise ажиллуулна.
 */
let loadPromise: Promise<DatabaseSnapshot> | null = null
let loadingDomainId: string | null = null

/** Domain-ийг ачаалж, 3 engine-д бэлдэнэ. */
export async function loadDomain(domainId: string): Promise<DatabaseSnapshot> {
  // Ижил domain аль хэдийн ачаалж байвал тэр promise-г буцаана.
  if (loadPromise && loadingDomainId === domainId) {
    return loadPromise
  }

  loadingDomainId = domainId
  loadPromise = doLoadDomain(domainId)

  try {
    return await loadPromise
  } finally {
    loadPromise = null
    loadingDomainId = null
  }
}

async function doLoadDomain(domainId: string): Promise<DatabaseSnapshot> {
  const domain = getDomains().find((d) => d.id === domainId)
  if (!domain) {
    throw new QueryError(`"${domainId}" домэйн олдсонгүй.`, 'postgres')
  }

  // 1. PostgreSQL — DDL + seed
  await getPGlite()
  await resetPostgres(domain.ddl, domain.seed)

  // 2. Schema мета өгөгдөл уншина
  const tables = await getPostgresSchema()

  // 3. Мөрийн датаг авч MongoDB-д хуулна
  const tableNames = tables.map((t) => t.name)
  mongoStore = await extractPGliteToMongo(await getPGlite(), tableNames)
  setMongoCollections(mongoStore)

  // 4. MySQL (alasql) — ижил дата
  await clearAlasql()
  for (const table of tables) {
    const rows = mongoStore[table.name] ?? []
    // Баганын төрлийг дамжуулна — VARCHAR-ийг STRING хэвээр
    // үлдээхэд чухал (postal_code, phone гэх мэт).
    const types = new Map(table.columns.map((c) => [c.name, c.type]))
    await createAlasqlTable(table.name, rows, types)
  }

  currentDomain = domain
  currentSnapshot = {
    domainId: domain.id,
    tables,
    engineLabels: {
      postgres: 'PostgreSQL 17 (PGlite WASM)',
      mysql: 'MySQL-compatible (alasql)',
      mongodb: 'MongoDB-compatible (mingo)',
    },
  }

  return currentSnapshot
}

/** Одоогийн snapshot-ийг буцаана. */
export function getSnapshot(): DatabaseSnapshot | null {
  return currentSnapshot
}

/**
 * Schema-гийн мета өгөгдлийг ДАТА УСТГАЛГҮЙГЭЭР дахин уншина.
 *
 * `loadDomain`-ээс ялгаатай нь энэ нь DDL/seed-ийг дахин
 * ажиллуулахгүй — зөвхөн хүснэгтүүдийн одоогийн байдал (мөрийн тоо,
 * багана) уншина. INSERT/DELETE хийсний дараа UI-г шинэчлэхэд.
 */
export async function getTableMeta(): Promise<TableMeta[]> {
  const tables = await getPostgresSchema()

  // MySQL болон MongoDB-ийн collection-уудыг В Postgres-ийн датагаар
  // шинэчилнэ — ингэснээр 3 систем үргэлж нийцнэ.
  const tableNames = tables.map((t) => t.name)
  mongoStore = await extractPGliteToMongo(await getPGlite(), tableNames)
  setMongoCollections(mongoStore)

  await clearAlasql()
  for (const table of tables) {
    const types = new Map(table.columns.map((c) => [c.name, c.type]))
    await createAlasqlTable(table.name, mongoStore[table.name] ?? [], types)
  }

  if (currentSnapshot) {
    currentSnapshot = { ...currentSnapshot, tables }
  }

  return tables
}

/** Одоогийн domain-ийг буцаана. */
export function getCurrentDomain(): DomainDefinition | null {
  return currentDomain
}

/** Одоогийн MongoDB collection-ууд. */
export function getMongoStore(): MongoCollections {
  return mongoStore
}

/** Сонгосон engine-ээр query ажиллуулна. */
export async function execute(
  dbKind: DbKind,
  query: string,
  options: { limit?: number } = {},
): Promise<QueryResult> {
  switch (dbKind) {
    case 'postgres':
      return runPostgres(query, options)
    case 'mysql':
      return runMysql(query, options)
    case 'mongodb':
      return runMongo(query, { ...options, collectionsOverride: mongoStore })
    default: {
      const _exhaustive: never = dbKind
      throw new QueryError(`Дэмжигдэхгүй database: ${String(_exhaustive)}`, 'postgres')
    }
  }
}

/**
 * Одоогийн domain-ийг бүхэлд нь дахин ачаална (Reset).
 * PGlite-ийг шинээр үүсгэхгүй — зөвхөн schema-г сэргээнэ (хурдан).
 */
export async function resetCurrentDomain(): Promise<DatabaseSnapshot> {
  if (!currentDomain) {
    throw new QueryError('Domain ачаалагдаагүй байна.', 'postgres')
  }
  return loadDomain(currentDomain.id)
}

/** Одоогийн байдлыг шалгана — ямар engine бэлэн байна. */
export async function getStatus(): Promise<EngineStatus> {
  const status: EngineStatus = {
    postgres: 'idle',
    mysql: 'idle',
    mongodb: 'idle',
  }
  try {
    const db = await getPGlite()
    await db.query('SELECT 1')
    status.postgres = 'ready'
    status.mysql = Object.keys(mongoStore).length > 0 ? 'ready' : 'idle'
    status.mongodb = Object.keys(mongoStore).length > 0 ? 'ready' : 'idle'
  } catch {
    status.postgres = 'error'
  }
  return status
}

/** Duul: түүхий DDL ажиллуулах (sandbox горимд). */
export async function executeScript(sql: string): Promise<void> {
  await runPostgresScript(sql)
}

/** Domain-ийн жишээ query-г тухайн engine-д тохируулж буцаана. */
export function exampleFor(
  example: { sql: string; mongo?: string },
  dbKind: DbKind,
): string {
  if (dbKind === 'mongodb') {
    return example.mongo ?? `// Энэ жишээнд MongoDB хувилбар байхгүй\n// SQL-ийг Mongo pipeline болгон хөрвүүлээрэй`
  }
  return example.sql
}

/** Domain-ийг солих үед хуучин төлөвийг цэвэрлэнэ. */
export function clearDomainState(): void {
  currentDomain = null
  currentSnapshot = null
  mongoStore = {}
  setMongoCollections({})
}
