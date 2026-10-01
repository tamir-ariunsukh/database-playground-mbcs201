'use client'

import type { PGlite } from '@electric-sql/pglite'
import { guardMongo } from '../guard'
import type { CellValue, QueryResult } from '../types'
import { QueryError } from '../types'
import { aggregateWithCollections, getMingo } from './mingo'

/**
 * mingo — MongoDB-ийн query хэлний JavaScript хэрэгжүүлэлт.
 *
 * MongoDB нь C++-ээр бичигдсэн, browser-д ажиллуулах боломжгүй.
 * mingo нь MongoDB-ийн query operator-уудыг ($gt, $in, $regex),
 * aggregation pipeline ($group, $match, $lookup, $unwind) болон
 * projection, sort, limit-ийг бүрэн дэмжинэ.
 *
 * ⚠️ mingo-г ШУУД import хийхгүй — `./mingo` модулийг ашиглана.
 * Учир нь mingo нь tree-shakeable: pipeline operator-ууд нь
 * `mingo/init/system` side-effect module-ээр бүртгэгддэг бөгөөд
 * bundler ээрийг tree-shake хийвэл `$group` нь "unregistered pipeline
 * operator" алдаа өгнө. Дэлгэрэнгүйг `./mingo.ts`-ээс үзнэ үү.
 *
 * Ялгаа: mingo нь документуудыг JS массивт хадгална (RAM-д),
 * бодит MongoDB шиг BSON, sharding, replica set байхгүй.
 * Гэхдээ query хэл нь ижил — хүүхэд MongoDB syntax сурна.
 */

export type MongoCollections = Record<string, Record<string, unknown>[]>

let collections: MongoCollections = {}

/** Collection-уудыг тогтооно (seed/reset үед дуудна). */
export function setMongoCollections(next: MongoCollections): void {
  collections = next
}

/** Collection-уудыг буцаана. */
export function getMongoCollections(): MongoCollections {
  return collections
}

/**
 * MongoDB query ажиллуулна.
 *
 * Хэрэглэгч Mongo shell-ийн синтаксийг бичнэ:
 *   db.books.find({ published: { $gt: 2000 } }).sort({ title: 1 }).limit(10)
 *   db.books.aggregate([{ $group: { _id: "$category_id", n: { $sum: 1 } } }])
 */
export async function runMongo(
  input: string,
  options: { limit?: number; collectionsOverride?: MongoCollections } = {},
): Promise<QueryResult> {
  const limit = options.limit ?? 500
  const store = options.collectionsOverride ?? collections

  const verdict = guardMongo(input)
  if (!verdict.allowed) {
    throw new QueryError(verdict.reason ?? 'Асуулга зөвшөөрөгдөхгүй.', 'mongodb', {
      hint: verdict.suggestion,
    })
  }

  const parsed = parseMongoQuery(input)
  if (!parsed.ok) {
    throw new QueryError(parsed.error, 'mongodb', { hint: parsed.hint })
  }

  const { collection, operation, args, chain } = parsed
  const docs = store[collection]

  if (!docs) {
    throw new QueryError(`"${collection}" collection олдсонгүй.`, 'mongodb', {
      hint: `Боломжит collection-ууд: ${Object.keys(store).join(', ')}`,
    })
  }

  const start = performance.now()

  try {
    // ⚠️ ШУУД `import('mingo')` ХИЙХГҮЙ — `./mingo` модулийг ашиглана.
    //
    // `await import('mingo/init/system')` гэж динамик import хийвэл
    // bundler тусдаа chunk үүсгэж, side-effect нь ачаалагдах
    // дараалал баталгаагүй болно. Ингэснээр `$group` нь
    // "unregistered pipeline operator" алдаа өгдөг.
    //
    // `./mingo` модуль нь `mingo/init/system`-ийг СТАТИК import
    // хийсэн тул bundler устгаж чадахгүй.
    const { Query } = getMingo()

    let out: Record<string, unknown>[]

    switch (operation) {
      case 'find': {
        const [filter = {}, projection] = args as [
          Record<string, unknown>?,
          Record<string, unknown>?,
        ]
        out = new Query(filter as never)
          .find(docs as never[], (projection ?? {}) as never)
          .all() as Record<string, unknown>[]
        break
      }
      case 'aggregate': {
        const pipeline = (args[0] ?? []) as Record<string, unknown>[]
        /*
         * ⚠️ `$lookup` нь `collectionResolver` шаарддаг. Хэрэв өгөхгүй
         * бол mingo нь "options?.collectionResolver is not a function"
         * алдаа өгнө. `aggregateWithCollections` нь бүх collection-ийг
         * мэддэг тул resolver-ийг зөв өгнө.
         */
        out = aggregateWithCollections(docs, pipeline, store)
        break
      }
      case 'countDocuments':
      case 'count': {
        const [filter = {}] = args as [Record<string, unknown>?]
        const n = new Query(filter as never).find(docs as never[]).count()
        out = [{ count: n }]
        break
      }
      case 'distinct': {
        const [field, filter = {}] = args as [string, Record<string, unknown>?]
        const fieldName = String(field).replace(/^\$/, '')
        const seen = new Set<string>()
        out = []
        for (const d of new Query(filter as never).find(docs as never[]).all() as Record<
          string,
          unknown
        >[]) {
          const key = JSON.stringify(d[fieldName])
          if (!seen.has(key)) {
            seen.add(key)
            out.push({ [fieldName]: d[fieldName] })
          }
        }
        break
      }
      case 'findOne': {
        const [filter = {}, projection] = args as [
          Record<string, unknown>?,
          Record<string, unknown>?,
        ]
        const all = new Query(filter as never)
          .find(docs as never[], (projection ?? {}) as never)
          .all() as Record<string, unknown>[]
        out = all.slice(0, 1)
        break
      }
      default:
        throw new QueryError(`Дэмжигдэхгүй үйлдэл: ${operation}()`, 'mongodb', {
          hint: 'find(), findOne(), aggregate(), countDocuments(), distinct() ашиглаарай.',
        })
    }

    // Chained .sort().skip().limit()
    if (chain.sort) out = applySort(out, chain.sort)
    if (chain.skip) out = out.slice(chain.skip)
    const effectiveLimit = chain.limit ?? limit
    /*
     * `truncated` нь ЗӨВХӨН бодитоор таслагдсан үед true.
     *
     * Хэрэв хэрэглэгч `.limit(20)` гэж бичсэн бол `chain.limit` нь
     * 20 — тэр тохиолдолд "LIMIT нэмэгдлээ" гэсэн анхааруулга
     * харуулах нь ТӨӨРӨГДҮҮЛНЭ, учир нь тэр LIMIT-ийг хэрэглэгч
     * өөрөө бичсэн. Зөвхөн БИД автоматаар нэмсэн үед л мэдэгдэнэ.
     */
    const autoLimited = chain.limit === undefined
    const truncated = autoLimited && out.length > effectiveLimit
    out = out.slice(0, effectiveLimit)
    const rows = out.map(normalizeMongoRow)
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []

    return {
      columns,
      rows,
      rowCount: rows.length,
      durationMs: performance.now() - start,
      truncated,
    }
  } catch (err) {
    if (err instanceof QueryError) throw err
    throw new QueryError(`MongoDB асуулгын алдаа: ${(err as Error).message}`, 'mongodb', {
      hint: 'Синтакс шалгаарай. Жишээ: db.books.find({ price: { $gt: 30000 } })',
    })
  }
}

// ---------------------------------------------------------------------------
// Mongo shell синтакс parser
// ---------------------------------------------------------------------------

interface MongoParsed {
  ok: true
  collection: string
  operation: string
  args: unknown[]
  chain: { sort?: Record<string, number>; limit?: number; skip?: number }
}
interface MongoParseError {
  ok: false
  error: string
  hint: string
}

/**
 * `db.books.find({...}).sort({...}).limit(5)` хэлбэрийн мөрийг parse хийж,
 * collection, operation, аргумент, chain-ийг гаргана.
 *
 * `eval()` ХЭРЭГЛЭХГҮЙ — аюулгүй байдлын шалтгаанаар гараар parse хийнэ.
 * Зөвхөн Mongo shell-ийн түгээмэл хэлбэрийг танина.
 */
export function parseMongoQuery(input: string): MongoParsed | MongoParseError {
  const trimmed = input.trim().replace(/;\s*$/, '')

  const head = /^db\.([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*([A-Za-z]+)\s*\(/.exec(trimmed)
  if (!head) {
    return {
      ok: false,
      error: 'Асуулга нь db.collection.method(...) хэлбэртэй байх ёстой.',
      hint: 'Жишээ: db.books.find({ price: { $gt: 30000 } }).sort({ price: -1 }).limit(10)',
    }
  }

  const collection = head[1]
  const operation = head[2]

  const openIdx = trimmed.indexOf('(', head[0].length - 1)
  const closeIdx = findMatchingParen(trimmed, openIdx)
  if (openIdx === -1 || closeIdx === -1) {
    return {
      ok: false,
      error: 'Хаалт хаагдаагүй байна.',
      hint: 'Дутуу `)` тэмдэгтийг нэмээрэй.',
    }
  }

  const argsRaw = trimmed.slice(openIdx + 1, closeIdx).trim()
  let args: unknown[]
  try {
    const parsedArgs = argsRaw ? parseJsonLike(`[${argsRaw}]`) : []
    args = Array.isArray(parsedArgs) ? parsedArgs : [parsedArgs]
  } catch (e) {
    return {
      ok: false,
      error: `Аргументыг уншиж чадсангүй: ${(e as Error).message}`,
      hint: 'Ключийн нэрийг `"` хашилтад оруулах шаардлагагүй. Жишээ: { price: { $gt: 100 } }',
    }
  }

  const chain: MongoParsed['chain'] = {}
  const rest = trimmed.slice(closeIdx + 1)
  const chainRe = /\.\s*(sort|limit|skip)\s*\(([^)]*)\)/g
  let m: RegExpExecArray | null
  while ((m = chainRe.exec(rest)) !== null) {
    const method = m[1]
    const raw = m[2].trim()
    try {
      if (method === 'sort') chain.sort = parseJsonLike(raw) as Record<string, number>
      else if (method === 'limit') chain.limit = Number(raw)
      else if (method === 'skip') chain.skip = Number(raw)
    } catch {
      // Chained аргумент буруу бол алгасна — гол query ажиллана.
    }
  }

  return { ok: true, collection, operation, args, chain }
}

/** Хаалтыг тооцож харгалзах хаалтын байрлалыг олно (string-ийг алгасна). */
function findMatchingParen(s: string, openIdx: number): number {
  if (openIdx === -1) return -1
  let depth = 0
  let inStr: string | null = null
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === inStr) inStr = null
      continue
    }
    if (c === '"' || c === "'") {
      inStr = c
      continue
    }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** JS object literal-ийг JSON болгож хувиргана (quote-гүй key-г дэмжинэ). */
function parseJsonLike(s: string): unknown {
  const quoted = s.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
  const cleaned = quoted.replace(/,\s*([}\]])/g, '$1')
  return JSON.parse(cleaned)
}

function applySort(
  docs: Record<string, unknown>[],
  sort: Record<string, number>,
): Record<string, unknown>[] {
  const entries = Object.entries(sort)
  return [...docs].sort((a, b) => {
    for (const [field, dir] of entries) {
      const av = a[field]
      const bv = b[field]
      if (av === bv) continue
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      if ((av as never) < (bv as never)) return dir < 0 ? 1 : -1
      if ((av as never) > (bv as never)) return dir < 0 ? -1 : 1
    }
    return 0
  })
}

function normalizeMongoRow(row: Record<string, unknown>): Record<string, CellValue> {
  const out: Record<string, CellValue> = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === '_id' && typeof v === 'object' && v !== null) continue
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

// ---------------------------------------------------------------------------
// Postgres → MongoDB хөрвүүлэлт
// ---------------------------------------------------------------------------

/**
 * PGlite-ээс бүх хүснэгтийг уншиж MongoDB collection болгоно.
 * Ингэснээр нэг domain-ийг 3 системд зэрэгцүүлэн харуулж болно —
 * ижил өгөгдөл, өөр асуулгын хэл.
 *
 * ⚠️ ЧУХАЛ: PostgreSQL-ийн `NUMERIC` нь JS-д string болж ирдэг.
 * Хэрэв түүнийг шууд хадгалбал mingo-гийн `$avg`, `$sum` нь
 * зөвхөн тоо дээр ажилладаг тул 0 буцаана. Тиймээс тоо шиг
 * string-ийг number болгож хөрвүүлнэ.
 */
export async function extractPGliteToMongo(
  db: PGlite,
  tableNames: string[],
): Promise<MongoCollections> {
  const out: MongoCollections = {}

  // Баганын төрлийг нэг удаа уншина — normalize-д хэрэгтэй.
  const typeMap = await getColumnTypes(db)

  for (const table of tableNames) {
    const res = await db.query<Record<string, unknown>>(
      `SELECT * FROM "${table.replace(/"/g, '""')}"`,
    )
    out[table] = res.rows.map((r) => {
      const row: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(r)) {
        row[k] = coerceForMongo(v, typeMap.get(`${table}.${k}`))
      }
      return row
    })
  }
  return out
}

/** Бүх хүснэгтийн баганын төрлийг `table.column` → төрөл хэлбэрээр авна. */
async function getColumnTypes(db: PGlite): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const res = await db.query<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'`,
    )
    for (const r of res.rows) {
      map.set(`${r.table_name}.${r.column_name}`, r.data_type)
    }
  } catch {
    // Schema уншиж чадсангүй — бүх string-ийг хэвээр үлдээнэ.
  }
  return map
}

/**
 * Postgres-ийн утгыг MongoDB-д тохирох хэлбэрт оруулна.
 *
 * ⚠️ Гол дүрэм: ЗӨВХӨН жинхэнэ тоон төрлийг (numeric, decimal, real,
 * double precision, integer) number болгоно. VARCHAR/TEXT-ийг
 * string-ээр үлдээнэ.
 *
 * Яагаад: `postal_code VARCHAR(10)` нь '210001' — энэ нь ТЕКСТ.
 * Тоо болговол `{ $match: { postal_code: '210001' } }` олдохгүй,
 * мөн `'0123'` гэсэн код нь эхний 0-ээ алдана.
 */
function coerceForMongo(v: unknown, typeName?: string): unknown {
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
      // Зөвхөн БУТАРХАЙГ number болгоно — mingo-гийн $avg/$sum-д
      // хэрэгтэй. Бүхэл тоог string-ээр үлдээвэл $sum нэмэгдэхгүй,
      // харин number болговол ID, код зэрэг утга гэмтэж болзошгүй.
      const decimals = v.split('.')[1].length
      if (decimals <= 15) return Number(v)
    }

    // NUMERIC боловч бүхэл (жишээ нь "50000.00" → "50000")
    if (numericType && /^-?\d+\.0+$/.test(v)) {
      return Number(v.replace(/\.0+$/, ''))
    }

    return v
  }
  return v
}
