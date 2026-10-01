'use client'

import type { PGlite } from '@electric-sql/pglite'
import { applyLimit, guardSql, needsLimit, splitStatements } from '../guard'
import type { CellValue, ColumnMeta, QueryResult, TableMeta } from '../types'
import { QueryError } from '../types'

/**
 * PGlite — жинхэнэ PostgreSQL 17, WebAssembly-д компиляцлагдсан.
 *
 * Энэ нь дуураймал БИШ. `SELECT version()` нь үнэхээр
 * "PostgreSQL 17.x" гэж буцаана. Бүх хязгаар, транзакц,
 * EXPLAIN ANALYZE, цонх функц — бүгд жинхэнэ.
 *
 * Ажиллах орчин: browser-ийн WebAssembly sandbox, `mem://` in-memory FS.
 * Ямар ч сервер, файл систем, сүлжээнд хүрэх боломжгүй.
 */

let instance: PGlite | null = null
let loading: Promise<PGlite> | null = null

/** PGlite-г lazy-аар ачаална — нүүр хуудас хурдан ачаалахын тулд. */
export async function getPGlite(): Promise<PGlite> {
  if (instance) return instance
  if (loading) return loading

  loading = (async () => {
    const { PGlite } = await import('@electric-sql/pglite')
    // `memory://` — бүх өгөгдөл RAM-д, browser табыг хаахад устна.
    const db = await PGlite.create({ dataDir: 'memory://' })
    instance = db
    return db
  })()

  return loading
}

/** Одоогийн instance-ийг буцаана (ачаалаагүй бол null). */
export function getPGliteSync(): PGlite | null {
  return instance
}

/**
 * Query ажиллуулна.
 *
 * @param sql Хэрэглэгчийн бичсэн SQL
 * @param options.limit SELECT-д автоматаар нэмэх LIMIT (default 500)
 * @param options.skipGuard Guard-ийг алгасах (дотоод seed-д)
 */
export async function runPostgres(
  sql: string,
  options: { limit?: number; skipGuard?: boolean } = {},
): Promise<QueryResult> {
  const limit = options.limit ?? 500

  if (!options.skipGuard) {
    const verdict = guardSql(sql)
    if (!verdict.allowed) {
      throw new QueryError(verdict.reason ?? 'Асуулга зөвшөөрөгдөхгүй.', 'postgres', {
        hint: verdict.suggestion,
      })
    }
  }

  const db = await getPGlite()
  const start = performance.now()

  /*
   * Олон statement-ийг дэмжинэ.
   *
   * `db.query()` нь зөвхөн НЭГ statement хүлээн авдаг — олон
   * statement өгвөл алдаа өгнө. Тиймээс:
   *   - Нэг statement бол `query()` — үр дүнг авна
   *   - Олон statement бол `exec()` — бүгдийг ажиллуулж, дараа нь
   *     хамгийн сүүлийн SELECT-ийн үр дүнг тусад нь авна
   *
   * Энэ нь нормалчлалын жишээнүүдэд (DROP; CREATE; INSERT; SELECT)
   * чухал.
   */
  const statements = splitStatements(sql)

  if (statements.length === 0) {
    throw new QueryError('Асуулгад гүйцэтгэх statement байхгүй.', 'postgres')
  }

  try {
    if (statements.length === 1) {
      return await runSingleStatement(db, statements[0], start, limit)
    }

    /*
     * Олон statement: exec() нь бүгдийг нэг transaction-д ажиллуулна.
     * Дараа нь хамгийн сүүлийн SELECT-ийг тусад нь ажиллуулж үр дүнг авна.
     */
    await db.exec(sql)

    // Сүүлийн SELECT-ийг олж, түүнийг ажиллуулна.
    const lastSelect = [...statements]
      .reverse()
      .find((s) => /^\s*(select|with|explain|show|values|table)\b/i.test(s))

    if (!lastSelect) {
      const durationMs = performance.now() - start
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        durationMs,
        truncated: false,
        affectedRows: countAffected(statements),
        notice: describeMultiStatement(statements),
      }
    }

    const result = await runSingleStatement(db, lastSelect, start, limit)
    return {
      ...result,
      notice: describeMultiStatement(statements),
    }
  } catch (err) {
    throw toQueryError(err, 'postgres')
  }
}

/** Нэг statement ажиллуулна. */
async function runSingleStatement(
  db: PGlite,
  stmt: string,
  start: number,
  limit: number,
): Promise<QueryResult> {
  // SELECT байгаа ч LIMIT байхгүй бол нэмнэ — санамсаргүй 100,000 мөр
  // татахаас сэргийлнэ.
  const isSelect = /^\s*(select|with|explain|show|values|table)\b/i.test(stmt.trim())
  const wantsAutoLimit = isSelect && needsLimit(stmt, limit)
  const finalSql = wantsAutoLimit ? applyLimit(stmt, limit) : stmt.trim().replace(/;\s*$/, '')

  const raw = await db.query<Record<string, unknown>>(finalSql)
  const durationMs = performance.now() - start

  // PGlite нь олон statement-д массив буцааж болно — сүүлийн үр дүнг авна.
  const results = Array.isArray(raw) ? raw : [raw]
  const last = results[results.length - 1]

  /*
   * Баганын төрлийг тодорхойлж, зөв normalize хийнэ.
   *
   * `fields` нь PGlite-ээс ирдэг: [{ name, dataTypeID }]. Энэ нь
   * NUMERIC-ийг number, VARCHAR-ийг string болгоход хэрэгтэй —
   * эс бөгөөс шуудангийн код '210001' нь 210001 тоо болж,
   * '210001' = 210001 харьцуулалт унана.
   */
  const types = new Map<string, string>()
  for (const f of last?.fields ?? []) {
    types.set(f.name, oidToTypeName((f as { dataTypeID?: number }).dataTypeID ?? 0))
  }

  const rows = (last?.rows ?? []).map((row: Record<string, unknown>) =>
    normalizeRow(row, types),
  )
  const columns = rows.length > 0 ? Object.keys(rows[0]) : inferColumns(last?.fields)

  /*
   * `truncated` нь ЗӨВХӨН бодитоор таслагдсан үед true байх ёстой.
   *
   * Хэрэв асуулга LIMIT 500-аас цөөн мөр буцаасан бол (жишээ нь
   * `SELECT COUNT(*)` нь 1 мөр) "LIMIT нэмэгдлээ" гэсэн
   * анхааруулга харуулах нь ТӨӨРӨГДҮҮЛНЭ. Тиймээс мөрийн тоог
   * шалгана — LIMIT-тэй яг тэнцүү байвал л таслагдсан гэж үзнэ.
   */
  const truncated = wantsAutoLimit && rows.length >= limit && rows.length > 0

  return {
    columns,
    rows,
    rowCount: rows.length,
    durationMs,
    truncated,
    affectedRows: last?.affectedRows,
    notice: describeStatement(finalSql, last?.affectedRows),
  }
}

/** Олон statement-ийн нийт нөлөөлсөн мөрийн тоог тооцоолно. */
function countAffected(statements: string[]): number | undefined {
  const dml = statements.filter((s) => /^\s*(insert|update|delete)\b/i.test(s))
  return dml.length > 0 ? dml.length : undefined
}

/** Олон statement-ийн товч мэдэгдэл. */
function describeMultiStatement(statements: string[]): string {
  const counts = {
    create: 0,
    drop: 0,
    alter: 0,
    insert: 0,
    update: 0,
    delete: 0,
    select: 0,
  }

  for (const s of statements) {
    const t = s.trim().toLowerCase()
    if (t.startsWith('create table') || t.startsWith('create view')) counts.create++
    else if (t.startsWith('drop')) counts.drop++
    else if (t.startsWith('alter')) counts.alter++
    else if (t.startsWith('insert')) counts.insert++
    else if (t.startsWith('update')) counts.update++
    else if (t.startsWith('delete')) counts.delete++
    else if (/^(select|with|show|explain|values|table)\b/.test(t)) counts.select++
  }

  const parts: string[] = []
  if (counts.create) parts.push(`${counts.create} хүснэгт үүсгэх`)
  if (counts.alter) parts.push(`${counts.alter} бүтэц өөрчлөх`)
  if (counts.insert) parts.push(`${counts.insert} мөр нэмэх`)
  if (counts.update) parts.push(`${counts.update} мөр шинэчлэх`)
  if (counts.delete) parts.push(`${counts.delete} мөр устгах`)
  if (counts.drop) parts.push(`${counts.drop} объект устгах`)
  if (counts.select) parts.push(`${counts.select} унших`)

  const total = statements.length
  const summary = parts.length > 0 ? parts.join(', ') : `${total} үйлдэл`

  return `${total} statement амжилттай ажиллалаа — ${summary}.`
}

/** Олон statement-ийг дараалан ажиллуулна (seed, DDL-д). */
export async function runPostgresScript(sql: string): Promise<void> {
  const db = await getPGlite()
  try {
    await db.exec(sql)
  } catch (err) {
    throw toQueryError(err, 'postgres')
  }
}

/** Бүх хүснэгтийг устгаж, schema-г дахин үүсгэнэ. */
export async function resetPostgres(ddl: string, seed: string): Promise<void> {
  const db = await getPGlite()

  /*
   * Бүх хүснэгт, view-г олж устгана.
   *
   * Анхаар: эхлээд VIEW-г устгана — учир нь view нь хүснэгтээс
   * хамааралтай байж болно (view → table FK шиг). Дараа нь хүснэгтүүд.
   *
   * ⚠️ React StrictMode нь effect-ийг ХОЁР удаа дууддаг (development-д).
   * Тиймээс энэ функц идемпотент байх ёстой — дахин дуудахад алдаа
   * өгөхгүй. `IF EXISTS` нь үүнийг баталгаажуулна.
   */
  const existing = await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  )
  const views = await db.query<{ viewname: string }>(
    `SELECT viewname FROM pg_views WHERE schemaname = 'public'`,
  )

  // Нэг DROP мөр бүрийг ТУСДАА ажиллуулна. Хэрэв нэг нь алдаа гарвал
  // бусад нь үргэлжлэх ёстой — тиймээс `exec`-д бөөнөөр биш,
  // мөр тус бүрээр дуудна.
  for (const r of views.rows) {
    await db.exec(`DROP VIEW IF EXISTS ${q(r.viewname)} CASCADE;`)
  }
  for (const r of existing.rows) {
    await db.exec(`DROP TABLE IF EXISTS ${q(r.tablename)} CASCADE;`)
  }

  // DDL болон seed-ийг ажиллуулна.
  //
  // ⚠️ ЧУХАЛ: `db.exec` нь олон statement-ийг нэг implicit
  // transaction-д багцлана. Тиймээс DDL ба seed-ийг НЭГ дор
  // ажиллуулах ЁСТОЙ — тэгэхгүй бол seed доторх FK алдаа нь
  // DDL-ийг ч цуцалж, "relation does not exist" алдаа гарна.
  //
  // Мөн statement-уудыг `;`-ээр хувааж batch хийх ЁСГҮЙ:
  // `books.author_id → authors` FK тул дараалал чухал, batch-ийн
  // хязгаар дарааллыг тасалж, FK алдаа гаргадаг.
  await db.exec(`${ddl}\n${seed}`)
}

/** Схемийн бүтэн мета өгөгдөл — schema explorer-т. */
export async function getPostgresSchema(): Promise<TableMeta[]> {
  const db = await getPGlite()

  const tables = await db.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `)

  const out: TableMeta[] = []

  for (const { table_name } of tables.rows) {
    const cols = await db.query<{
      column_name: string
      data_type: string
      is_nullable: string
      column_default: string | null
    }>(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table_name],
    )

    const pks = await db.query<{ column_name: string }>(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = '${table_name.replace(/'/g, "''")}'
    `)

    const fks = await db.query<{
      column_name: string
      foreign_table: string
      foreign_column: string
    }>(`
      SELECT kcu.column_name,
             ccu.table_name  AS foreign_table,
             ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = '${table_name.replace(/'/g, "''")}'
    `)

    const pkSet = new Set(pks.rows.map((r) => r.column_name))
    const fkMap = new Map(
      fks.rows.map((r) => [r.column_name, { table: r.foreign_table, column: r.foreign_column }]),
    )

    const countRes = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${q(table_name)}`,
    )

    const columns: ColumnMeta[] = cols.rows.map((c) => ({
      name: c.column_name,
      type: c.data_type,
      nullable: c.is_nullable === 'YES',
      isPrimaryKey: pkSet.has(c.column_name),
      isForeignKey: fkMap.has(c.column_name),
      references: fkMap.get(c.column_name),
      default: c.column_default ?? undefined,
    }))

    out.push({
      name: table_name,
      columns,
      rowCount: countRes.rows[0]?.n ?? 0,
    })
  }

  return out
}

/** SQL identifier-ийг quote хийнэ. */
function q(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`
}

/**
 * PostgreSQL-ийн төрлийн OID-г нэр болгоно.
 *
 * Зөвхөн түгээмэл төрлүүдийг. Бүрэн жагсаалт: `pg_type` системийн
 * хүснэгтэд байна.
 */
function oidToTypeName(oid: number): string {
  const map: Record<number, string> = {
    16: 'boolean',
    20: 'bigint',
    21: 'smallint',
    23: 'integer',
    25: 'text',
    700: 'real',
    701: 'double precision',
    1042: 'character',
    1043: 'character varying',
    1082: 'date',
    1114: 'timestamp',
    1184: 'timestamptz',
    1700: 'numeric',
    1186: 'interval',
    114: 'json',
    3802: 'jsonb',
    2950: 'uuid',
  }
  return map[oid] ?? 'unknown'
}

/** Тоон төрөл мөн эсэх — зөвхөн эдгээрийг number болгоно. */
function isNumericType(typeName: string): boolean {
  return (
    typeName === 'numeric' ||
    typeName === 'decimal' ||
    typeName === 'integer' ||
    typeName === 'bigint' ||
    typeName === 'smallint' ||
    typeName === 'real' ||
    typeName === 'double precision'
  )
}

/** PGlite-ийн мөрийг UI-д тохирох хэлбэрт оруулна. */
function normalizeRow(
  row: Record<string, unknown>,
  types?: Map<string, string>,
): Record<string, CellValue> {
  const out: Record<string, CellValue> = {}
  for (const [k, v] of Object.entries(row)) {
    out[k] = normalizeValue(v, types?.get(k))
  }
  return out
}

/**
 * Утгыг UI-д тохирох хэлбэрт оруулна.
 *
 * @param v Postgres-ээс ирсэн утга
 * @param typeName Баганын төрлийн нэр (мэдэгдэж байвал)
 */
function normalizeValue(v: unknown, typeName?: string): CellValue {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)

  if (typeof v === 'bigint') {
    const n = Number(v)
    return Number.isSafeInteger(n) ? n : v.toString()
  }

  if (typeof v === 'number' || typeof v === 'boolean') return v

  if (typeof v === 'string') {
    /*
     * String-ийг тоо болгох ЭСЭХИЙГ ШИЙДНЭ.
     *
     * ⚠️ `210001` гэсэн шуудангийн код, `99112233` гэсэн утасны
     * дугаар нь NUMBER БИШ — текст. Тэднийг тоо болговол:
     *   - Эхний 0 устана ('0123' → 123)
     *   - `postal_code = '210001'` харьцуулалт унана
     *   - Grid-д '210001' биш '210,001' гэж харагдана
     *
     * Тиймээс ЗӨВХӨН:
     *   1. Баганын төрөл нь NUMERIC/DECIMAL/REAL гэж тодорхой
     *      мэдэгдэж байвал, эсвэл
     *   2. Төрөл нь тодорхойгүй ч утга нь бутархай ('.' агуулсан)
     *      байвал
     * number болгоно — бутархайг string-ээр үлдээвэл AVG/SUM
     * буруу ажиллана.
     */
    if (typeName && isNumericType(typeName)) {
      // NUMERIC/DECIMAL — нарийвчлал алдагдахгүй бол number болгоно.
      if (/^-?\d+(\.\d+)?$/.test(v)) {
        const decimals = v.includes('.') ? v.split('.')[1].length : 0
        // 17 оронтой тоо нь double-д бүрэн багтана (IEEE 754).
        if (decimals <= 15 && v.replace(/[-.]/g, '').length <= 15) {
          return Number(v)
        }
      }
      return v
    }

    if (typeName === undefined && /^-?\d+\.\d+$/.test(v)) {
      // Төрөл тодорхойгүй, гэхдээ бутархай — AVG/SUM-д тоо хэрэгтэй.
      return Number(v)
    }

    // VARCHAR / TEXT / CHARACTER — string үлдээнэ.
    return v
  }

  if (Array.isArray(v)) return v as unknown[]
  if (typeof v === 'object') {
    try {
      return JSON.parse(JSON.stringify(v))
    } catch {
      return String(v)
    }
  }
  return String(v)
}

function inferColumns(fields?: { name: string }[]): string[] {
  return fields?.map((f) => f.name) ?? []
}

/** Statement-ийн төрлийг тодорхоолж, хэрэглэгчид мэдэгдэл буцаана. */
function describeStatement(sql: string, affectedRows?: number): string | undefined {
  const s = sql.trim().toLowerCase()
  if (s.startsWith('create table')) return 'Хүснэгт үүслээ.'
  if (s.startsWith('create view')) return 'VIEW үүслээ.'
  if (s.startsWith('create index')) return 'INDEX үүслээ.'
  if (s.startsWith('insert')) return `${affectedRows ?? '?'} мөр нэмэгдлээ.`
  if (s.startsWith('update')) return `${affectedRows ?? '?'} мөр өөрчлөгдлөө.`
  if (s.startsWith('delete')) return `${affectedRows ?? '?'} мөр устлаа.`
  if (s.startsWith('drop')) return 'Объект устлаа.'
  if (s.startsWith('begin')) return 'Транзакц эхэллээ.'
  if (s.startsWith('commit')) return 'Өөрчлөлт хадгалагдлаа.'
  if (s.startsWith('rollback')) return 'Өөрчлөлт цуцлагдлаа.'
  if (s.startsWith('alter')) return 'Хүснэгтийн бүтэц өөрчлөгдлөө.'
  return undefined
}

/** PGlite-ийн алдааг ойлгомжтой QueryError болгоно. */
function toQueryError(err: unknown, dbKind: 'postgres' | 'mysql'): QueryError {
  const e = err as {
    message?: string
    detail?: string
    hint?: string
    position?: string
    code?: string
  }

  return new QueryError(e.message ?? String(err), dbKind, {
    detail: e.detail,
    hint: e.hint ?? translatePgHint(e.code),
    position: e.position ? Number(e.position) : undefined,
  })
}

/** Postgres-ийн түгээмэл алдааны кодыг монгол зөвлөгөө болгоно. */
function translatePgHint(code?: string): string | undefined {
  const map: Record<string, string> = {
    '42P01':
      'Хүснэгтийн нэр зөв эсэхийг шалгаарай. Зүүн самбараас хүснэгтүүдийг харна уу.',
    '42703': 'Баганын нэр зөв эсэхийг шалгаарай.',
    '23505': 'UNIQUE хязгаар зөрчигдлөө — энэ утга аль хэдийн байна.',
    '23503': 'FOREIGN KEY хязгаар зөрчигдлөө — холбоотой мөр байхгүй.',
    '23514': 'CHECK хязгаар зөрчигдлөө — утга зөвшөөрөгдөх хязгаарт байхгүй.',
    '23502': 'NOT NULL хязгаар зөрчигдлөө — заавал утга оруулах ёстой.',
    '42601': 'SQL синтакс алдаа. Хаалт, таслал, түлхүүр үгээ шалгаарай.',
    '42P07': 'Энэ нэртэй объект аль хэдийн байна.',
    '42701': 'Энэ багана аль хэдийн байна.',
    '22P02': 'Утгын төрөл буруу — жишээ нь тоо оруулах ёстой газар текст оруулсан.',
    '22007': 'Огнооны формат буруу. `YYYY-MM-DD` хэлбэр хэрэглээрэй.',
    '40001': 'Дарааллын зөрчил (serialization failure) — дахин оролдоно уу.',
    '25P02': 'Транзакц аль хэдийн цуцлагдсан — ROLLBACK хийгээд дахин эхлээрэй.',
  }
  return code ? map[code] : undefined
}
