'use client'

import { applyLimit, guardSql, needsLimit, splitStatements } from '../guard'
import type { CellValue, QueryResult } from '../types'
import { QueryError } from '../types'

/**
 * alasql — JavaScript-д бичигдсэн SQL engine (MySQL-like).
 *
 * Яагаад MySQL-ийн оронд alasql вэ:
 *   - MySQL нь C++-оор бичигдсэн, WASM хувилбар нь хүнд, тогтворгүй
 *   - alasql нь MySQL-ийн синтакс (backtick, LIMIT, IFNULL, NOW()) дэмжинэ
 *   - 100% JS, browser-д шууд ажиллана, WASM шаардлагагүй, хөнгөн
 *
 * Хязгаарлалт: жинхэнэ MySQL биш. `EXPLAIN`, transaction,
 * stored procedure бүрэн дэмжигдэхгүй. Хичээлийн зорилгоор бол хангалттай —
 * SELECT, JOIN, GROUP BY, HAVING, subquery бүгд ажиллана.
 */

interface AlasqlDatabase {
  exec: (sql: string, params?: unknown[]) => unknown
  tables: Record<string, unknown>
}

let db: AlasqlDatabase | null = null
let loading: Promise<AlasqlDatabase> | null = null
let availableTables: string[] = []

/** alasql-ийг lazy-аар ачаална. */
export async function getAlasql(): Promise<AlasqlDatabase> {
  if (db) return db
  if (loading) return loading

  loading = (async () => {
    const mod = await import('alasql')
    const alasql = (mod.default ?? mod) as unknown as {
      Database: new (name: string) => AlasqlDatabase
    }
    const database = new alasql.Database('mysql_like')
    db = database
    return database
  })()

  return loading
}

/** Хүснэгт үүсгэж, мөрүүдийг оруулна.
 *
 * @param tableName Хүснэгтийн нэр
 * @param rows Мөрүүд
 * @param columnTypes `б��гана → Postgres төрөл` map (заавал биш)
 */
export async function createAlasqlTable(
  tableName: string,
  rows: Record<string, unknown>[],
  columnTypes?: Map<string, string>,
): Promise<void> {
  const database = await getAlasql()
  const safe = tableName.replace(/[^a-zA-Z0-9_]/g, '')

  // alasql-ийн зөв зам: CREATE TABLE бичээд, `SELECT * INTO <table> FROM ?`
  // гэж өгөгдлийн массивыг оруулна. Зөвхөн `tables[name] = rows` гэж
  // оноох нь ажиллахгүй — alasql нь тэр объектыг Table instance биш,
  // энгийн массив гэж үзээд query үед "Data source ... in undefined"
  // гэсэн алдаа гаргадаг.
  const sample = rows[0] ?? {}
  const colDefs = Object.entries(sample)
    .map(([name, value]) => {
      const safeName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) ? name : `"${name}"`
      return `${safeName} ${sqlTypeOf(value)}`
    })
    .join(', ')

  database.exec(`DROP TABLE IF EXISTS ${safe}`)
  database.exec(`CREATE TABLE ${safe} (${colDefs})`)

  if (rows.length > 0) {
    // `SELECT * INTO` нь alasql-д INSERT-ийн хамгийн хурдан зам.
    // `?` placeholder нь параметрийн массив руу заана.
    const sanitized = rows.map((r) => sanitizeRow(r, columnTypes))
    database.exec(`SELECT * INTO ${safe} FROM ?`, [sanitized])
  }

  if (!availableTables.includes(safe)) availableTables.push(safe)
}

/** JS утгын төрлөөс SQL баганын төрөл таамаглана. */
function sqlTypeOf(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? 'INT' : 'NUMBER'
  if (typeof v === 'boolean') return 'BOOLEAN'
  if (v instanceof Date) return 'DATE'
  return 'STRING'
}

/** alasql-д орох утгуудыг цэвэрлэнэ. */
function sanitizeRow(
  row: Record<string, unknown>,
  columnTypes?: Map<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    out[k] = coerceForSql(v, columnTypes?.get(k))
  }
  return out
}

/**
 * Postgres-ийн утгыг MySQL(alasql)-д тохирох хэлбэрт оруулна.
 *
 * ⚠️ Гол дүрэм: ЗӨВХӨН жинхэнэ тоон төрлийг number болгоно.
 * VARCHAR/TEXT нь string хэвээр — `postal_code` '210001', утас
 * '99112233' зэрэг нь ТЕКСТ. Тоо болговол `WHERE code = '210001'`
 * харьцуулалт унаж, эхний 0 устана.
 */
function coerceForSql(v: unknown, typeName?: string): unknown {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'bigint') {
    const n = Number(v)
    return Number.isSafeInteger(n) ? n : v.toString()
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v

  if (typeof v === 'string') {
    const numericType =
      typeName === 'numeric' ||
      typeName === 'decimal' ||
      typeName === 'real' ||
      typeName === 'double precision' ||
      typeName === 'integer' ||
      typeName === 'bigint' ||
      typeName === 'smallint'

    if (numericType && /^-?\d+\.\d+$/.test(v)) {
      const decimals = v.split('.')[1].length
      if (decimals <= 15) return Number(v)
    }
    if (numericType && /^-?\d+\.0+$/.test(v)) {
      return Number(v.replace(/\.0+$/, ''))
    }
    return v
  }
  return v
}

/** Хүснэгтийг устгана. */
export async function dropAlasqlTable(tableName: string): Promise<void> {
  const database = await getAlasql()
  const safe = tableName.replace(/[^a-zA-Z0-9_]/g, '')
  delete database.tables[safe]
  availableTables = availableTables.filter((t) => t !== safe)
}

/** Бүх хүснэгтийг устгана. */
export async function clearAlasql(): Promise<void> {
  const database = await getAlasql()
  for (const t of availableTables) {
    delete database.tables[t]
  }
  availableTables = []
}

/** MySQL-like query ажиллуулна. */
export async function runMysql(
  sql: string,
  options: { limit?: number } = {},
): Promise<QueryResult> {
  const limit = options.limit ?? 500

  const verdict = guardSql(sql)
  if (!verdict.allowed) {
    throw new QueryError(verdict.reason ?? 'Query зөвшөөрөгдөхгүй.', 'mysql', {
      hint: verdict.suggestion,
    })
  }

  const database = await getAlasql()
  const trimmed = sql.trim().replace(/;\s*$/, '')

  // SHOW TABLES-ийг гараар боловсруулна — alasql үүнийг дэмжихгүй.
  if (/^\s*show\s+tables\b/i.test(trimmed)) {
    return {
      columns: ['table_name'],
      rows: availableTables.map((t) => ({ table_name: t })),
      rowCount: availableTables.length,
      durationMs: 0,
      truncated: false,
      notice: 'SHOW TABLES — боломжит хүснэгтүүд.',
    }
  }

  /*
   * Олон statement-ийг дэмжинэ — PostgreSQL engine-тэй ижил зарчим.
   *
   * alasql нь олон statement-ийг нэг `exec`-д ажиллуулж чаддаг
   * (`query` биш, `exec` нь DDL-г боловсруулдаг) — гэхдээ зөвхөн
   * СҮҮЛИЙН statement-ийн үр дүнг буцаана. Тиймээс бид тус
   * тусад нь ажиллуулж, сүүлийн SELECT-ийг олж үр дүнг авна.
   */
  const statements = splitStatements(sql)

  if (statements.length === 0) {
    throw new QueryError('Query-д гүйцэтгэх statement байхгүй.', 'mysql')
  }

  const start = performance.now()

  try {
    // Бүх statement-ийг дараалан ажиллуулна.
    for (const stmt of statements) {
      database.exec(stmt)
    }

    // Сүүлийн SELECT-ийг олж үр дүнг авна.
    const lastSelect = [...statements]
      .reverse()
      .find((s) => /^\s*(select|with|describe|desc)\b/i.test(s))

    if (!lastSelect) {
      const durationMs = performance.now() - start
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        durationMs,
        truncated: false,
        affectedRows: statements.length,
        notice:
          statements.length === 1
            ? describeStatement(statements[0], statements.length)
            : `${statements.length} statement амжилттай ажиллалаа.`,
      }
    }

    const wantsAutoLimit = needsLimit(lastSelect, limit)
    const finalSql = wantsAutoLimit ? applyLimit(lastSelect, limit) : lastSelect
    const result = database.exec(finalSql) as unknown
    const durationMs = performance.now() - start

    // alasql нь SELECT-д массив, DML-д тоо буцаана.
    if (Array.isArray(result)) {
      const all = result as unknown[]
      const rows = all.slice(0, limit).map((r) => normalizeRow(r))
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []
      return {
        columns,
        rows,
        rowCount: rows.length,
        durationMs,
        // Зөвхөн бодитоор таслагдсан үед true.
        truncated: wantsAutoLimit && all.length >= limit,
      }
    }

    const affected = typeof result === 'number' ? result : undefined
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      durationMs,
      truncated: false,
      affectedRows: affected,
      notice:
        statements.length > 1
          ? `${statements.length} statement амжилттай ажиллалаа.`
          : describeStatement(finalSql, affected),
    }
  } catch (err) {
    throw toMysqlError(err)
  }
}

/** Одоо байгаа хүснэгтүүдийн нэрс. */
export function listAlasqlTables(): string[] {
  return [...availableTables]
}

/** MySQL-ийн түгээмэл функцуудыг Postgres хэлбэрээс хөрвүүлнэ. */
export function toMysqlSyntax(sql: string): string {
  return sql
    .replace(/\bCURRENT_DATE\s*\+\s*(\d+)/gi, (_, n) => `DATE_ADD(CURRENT_DATE, INTERVAL ${n} DAY)`)
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/\bSERIAL\b/gi, 'INT AUTO_INCREMENT')
    .replace(/\bNULLS\s+LAST\b/gi, '')
    .replace(/\bNULLS\s+FIRST\b/gi, '')
    .replace(/\|\|/g, '+')
}

function normalizeIncoming(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v
  }
  return out
}

void normalizeIncoming

function normalizeRow(row: unknown): Record<string, CellValue> {
  if (row === null || typeof row !== 'object') {
    return { value: normalizeValue(row) }
  }
  const out: Record<string, CellValue> = {}
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    out[k] = normalizeValue(v)
  }
  return out
}

function normalizeValue(v: unknown): CellValue {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'bigint') return Number(v)
  if (Array.isArray(v)) return v as unknown[]
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  return String(v)
}

function describeStatement(sql: string, affected?: number): string | undefined {
  const s = sql.trim().toLowerCase()
  if (s.startsWith('insert')) return `INSERT — ${affected ?? '?'} мөр нэмэгдлээ.`
  if (s.startsWith('update')) return `UPDATE — ${affected ?? '?'} мөр өөрчлөгдлөө.`
  if (s.startsWith('delete')) return `DELETE — ${affected ?? '?'} мөр устлаа.`
  return undefined
}

function toMysqlError(err: unknown): QueryError {
  const msg = (err as Error).message ?? String(err)
  const hint = /unknown table|not exist/i.test(msg)
    ? 'Хүснэгтийн нэр зөв эсэхийг шалгаарай. Schema tab-аас харна уу.'
    : /parse error|unexpected|syntax/i.test(msg)
      ? 'SQL синтакс алдаа. alasql нь MySQL-ийн бүх синтаксийг дэмжихгүй — LIMIT, backtick, IFNULL() ажиллана.'
      : undefined
  return new QueryError(msg, 'mysql', { hint })
}
