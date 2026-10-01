import type { DbKind, GuardVerdict } from './types'

/**
 * Асуулгын хамгаалалт (Query Guard) — оюутны бичсэн асуулгыг engine
 * рүү явуулахаас өмнө шалгана.
 *
 * Энэ нь аюулгүй байдлын ЦОРЫН ГАНЦ давхарга БИШ. Жинхэнэ хамгаалалт нь:
 *   1. Асуулга нь зөвхөн `mem:` (in-memory) дотор ажиллана — файл системд
 *      хүрэхгүй.
 *   2. PGlite нь browser-ийн WebAssembly sandbox дотор — OS-д хүрэх
 *      боломжгүй.
 *   3. Сервер огт байхгүй — халдах зүйл байхгүй.
 *
 * Гэхдээ guard нь:
 *   - Ойлгомжтой монгол алдаа өгнө (оюутан юу буруу бичсэнээ мэдэнэ)
 *   - Суралцахад хор хөнөөлтэй тушаалуудыг (DROP DATABASE, COPY FROM
 *     PROGRAM) сэргийлнэ
 *   - Хичээлийн явцад хүснэгт устгагдахаас хамгаална
 */

/** Хориглосон функцууд — сервер эсвэл файл системд хандах оролдлого. */
const FORBIDDEN_FUNCTIONS = [
  'pg_read_file',
  'pg_read_binary_file',
  'pg_ls_dir',
  'pg_stat_file',
  'pg_sleep',
  'lo_import',
  'lo_export',
  'dblink',
  'pg_execute_server_program',
  'pg_logical_emit_message',
]

/** Хориглосон түлхүүр үг/хэв маяг. */
const FORBIDDEN_PATTERNS: { pattern: RegExp; reason: string; suggestion: string }[] = [
  {
    pattern: /\bcopy\b[\s\S]*\bfrom\s+program\b/i,
    reason: 'COPY ... FROM PROGRAM нь системийн программыг ажиллуулж чадна.',
    suggestion: 'Зөвхөн COPY ... FROM STDIN эсвэл VALUES хэрэглээрэй.',
  },
  {
    pattern: /\bdrop\s+database\b/i,
    reason: 'DROP DATABASE нь бүх өгөгдлийг устгана.',
    suggestion: 'Хүснэгт устгах бол DROP TABLE, мөр устгах бол DELETE ашиглаарай.',
  },
  {
    pattern: /\bcreate\s+(?:or\s+replace\s+)?extension\b/i,
    reason: 'Өргөтгөл суулгах нь энэ орчинд зөвшөөрөгдөхгүй.',
    suggestion: 'Хичээлийн хүрээнд стандарт SQL функцууд хангалттай.',
  },
  {
    pattern: /\balter\s+system\b/i,
    reason: 'ALTER SYSTEM нь серверийн тохиргоог өөрчилнө.',
    suggestion: 'Хүснэгтийн бүтэц өөрчлөх бол ALTER TABLE ашиглаарай.',
  },
]

/**
 * Олон statement илрүүлэх — string literal болон comment-ийг арилгасны дараа
 * `;` тэмдэгтийн дараа өөр statement байгаа эсэхийг шалгана.
 */
function hasMultipleStatements(sql: string): boolean {
  return splitStatements(sql).length > 1
}

/**
 * SQL-ийг тусдаа statement болгон хуваана.
 *
 * String literal, comment, dollar-quoted блокийг тооцно — тиймээс
 * `INSERT ... VALUES ('a; b')` гэсэн нэг statement нь хоёр болж
 * хуваагдахгүй.
 */
export function splitStatements(sql: string): string[] {
  const parts: string[] = []
  let current = ''
  let i = 0
  const n = sql.length

  while (i < n) {
    const ch = sql[i]
    const next = sql[i + 1]

    // -- мөрийн comment — statement-д хадгална (тайлбар нь хэрэгтэй)
    if (ch === '-' && next === '-') {
      const start = i
      while (i < n && sql[i] !== '\n') i++
      current += sql.slice(start, i)
      continue
    }

    // /* блок comment */
    if (ch === '/' && next === '*') {
      const start = i
      i += 2
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++
      i += 2
      current += sql.slice(start, i)
      continue
    }

    // 'string literal' — `;` байсан ч хуваахгүй
    if (ch === "'") {
      const start = i
      i++
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2
          continue
        }
        if (sql[i] === "'") {
          i++
          break
        }
        i++
      }
      current += sql.slice(start, i)
      continue
    }

    // "identifier" — `;` байсан ч хуваахгүй
    if (ch === '"') {
      const start = i
      i++
      while (i < n && sql[i] !== '"') i++
      i++
      current += sql.slice(start, i)
      continue
    }

    // `backtick`
    if (ch === '`') {
      const start = i
      i++
      while (i < n && sql[i] !== '`') i++
      i++
      current += sql.slice(start, i)
      continue
    }

    // $$ dollar-quoted $$ эсвэл $tag$ ... $tag$
    if (ch === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
      if (m) {
        const tag = m[0]
        const end = sql.indexOf(tag, i + tag.length)
        const stop = end === -1 ? n : end + tag.length
        current += sql.slice(i, stop)
        i = stop
        continue
      }
    }

    // `;` — statement-ийн хязгаар
    if (ch === ';') {
      const trimmed = current.trim()
      if (trimmed.length > 0) parts.push(trimmed)
      current = ''
      i++
      continue
    }

    current += ch
    i++
  }

  const tail = current.trim()
  if (tail.length > 0) parts.push(tail)

  return parts
}

/**
 * SQL-ээс string literal, comment, dollar-quoted блокийг арилгана.
 * Ингэснээр `SELECT 'DROP DATABASE'` гэх мэт хуурамч илрүүлэлт гарахгүй.
 */
export function stripLiteralsAndComments(sql: string): string {
  let out = ''
  let i = 0
  const n = sql.length

  while (i < n) {
    const ch = sql[i]
    const next = sql[i + 1]

    // -- мөрийн comment
    if (ch === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++
      continue
    }

    // /* блок comment */
    if (ch === '/' && next === '*') {
      i += 2
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++
      i += 2
      continue
    }

    // 'string literal' ('' escape-тай)
    if (ch === "'") {
      i++
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2
          continue
        }
        if (sql[i] === "'") {
          i++
          break
        }
        i++
      }
      out += ' '
      continue
    }

    // "identifier" (квадрат bracket биш — Postgres-д identifier)
    if (ch === '"') {
      i++
      while (i < n && sql[i] !== '"') i++
      i++
      out += ' '
      continue
    }

    // `backtick` (MySQL identifier)
    if (ch === '`') {
      i++
      while (i < n && sql[i] !== '`') i++
      i++
      out += ' '
      continue
    }

    // $$ dollar-quoted $$ эсвэл $tag$ ... $tag$
    if (ch === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
      if (m) {
        const tag = m[0]
        const end = sql.indexOf(tag, i + tag.length)
        i = end === -1 ? n : end + tag.length
        out += ' '
        continue
      }
    }

    out += ch
    i++
  }

  return out
}

/** SQL асуулгыг шалгана. */
export function guardSql(sql: string): GuardVerdict {
  const trimmed = sql.trim()

  if (!trimmed) {
    return {
      allowed: false,
      reason: 'Асуулга хоосон байна.',
      suggestion: 'SELECT * FROM books; гэх мэт асуулга бичээрэй.',
    }
  }

  const statements = splitStatements(trimmed)

  if (statements.length === 0) {
    return {
      allowed: false,
      reason: 'Асуулгад гүйцэтгэх statement байхгүй.',
      suggestion: 'SELECT * FROM books; гэх мэт асуулга бичээрэй.',
    }
  }

  /*
   * Олон statement ЗӨВШӨӨРӨГДӨНӨ.
   *
   * Яагаад: нормалчлалын жишээнүүд (1NF → 2NF → 3NF) нь
   * DROP → CREATE → INSERT → SELECT гэсэн дараалалтай — нэг
   * statement-д багтахгүй. Мөн seed script, migration, transaction
   * бүгд олон statement.
   *
   * ХАМГААЛАЛТ: statement БҮРИЙГ тус тусад нь шалгана. Хэрэв аль
   * нэг нь хориглосон бол БҮГДИЙГ хориглоно — ингэснээр
   * `SELECT 1; DROP DATABASE x` гэх мэт залилаас сэргийлнэ.
   */
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    const verdict = guardSingleStatement(stmt, statements.length > 1 ? i + 1 : null)
    if (!verdict.allowed) return verdict
  }

  return { allowed: true }
}

/**
 * Нэг statement-ийг шалгана.
 *
 * @param stmt Шалгах statement
 * @param index Олон statement-ийн аль дугаар вэ (алдааны мессежид)
 */
function guardSingleStatement(stmt: string, index: number | null): GuardVerdict {
  const stripped = stripLiteralsAndComments(stmt).toLowerCase()
  const prefix = index !== null ? `${index}-р statement: ` : ''

  // 1. Хориглосон функцууд
  for (const fn of FORBIDDEN_FUNCTIONS) {
    if (new RegExp(`\\b${fn}\\s*\\(`, 'i').test(stripped)) {
      return {
        allowed: false,
        reason: `${prefix}${fn}() функц нь энэ орчинд хориглогдсон.`,
        matched: fn,
        suggestion: 'Хичээлийн хүрээнд энэ функц шаардлагагүй.',
      }
    }
  }

  // 2. Хориглосон хэв маяг
  for (const { pattern, reason, suggestion } of FORBIDDEN_PATTERNS) {
    if (pattern.test(stripped)) {
      return {
        allowed: false,
        reason: prefix + reason,
        matched: pattern.source,
        suggestion,
      }
    }
  }

  return { allowed: true }
}

/** MongoDB query объектыг шалгана. */
export function guardMongo(input: string): GuardVerdict {
  const trimmed = input.trim()

  if (!trimmed) {
    return {
      allowed: false,
      reason: 'Асуулга хоосон байна.',
      suggestion: 'db.books.find({ year: { $gt: 2000 } }) гэх мэт асуулга бичээрэй.',
    }
  }

  // MongoDB-д DDL/DML-ийн аюул бага, гэхдээ JS eval-ийн оролдлогыг хаана.
  if (/\$where\s*:/.test(trimmed) || /\bmapReduce\s*\(/.test(trimmed)) {
    return {
      allowed: false,
      reason: '$where болон mapReduce нь дурын JavaScript ажиллуулж чадна.',
      matched: '$where',
      suggestion: '$match, $group, $lookup зэрэг pipeline stage-уудыг ашиглаарай.',
    }
  }

  return { allowed: true }
}

/** Домэйн бүрт хориглосон мутаци (хичээлийн хүрээнд хамгаалалт). */
export function guardMutation(sql: string): GuardVerdict {
  const stripped = stripLiteralsAndComments(sql)
  const lower = stripped.toLowerCase()

  // TRUNCATE ... CASCADE нь холбоотой бүх хүснэгтийг цэвэрлэнэ — сэрэмжлүүлэх.
  if (/\btruncate\b/i.test(lower)) {
    return {
      allowed: true,
      reason: 'TRUNCATE нь бүх мөрийг устгана. Reset товчоор буцааж болно.',
    }
  }

  return { allowed: true }
}

/**
 * Query-д LIMIT байхгүй эсэхийг шалгана. Байхгүй бол UI-д
 * автоматаар LIMIT нэмэхээ мэдэгдэнэ.
 */
export function needsLimit(sql: string, defaultLimit = 500): boolean {
  const stripped = stripLiteralsAndComments(sql)
  if (!/^\s*(select|with)\b/i.test(stripped)) return false
  return !/\blimit\s+\d+/i.test(stripped)
}

/** SELECT асуулгад LIMIT нэмнэ (хэрэв байхгүй бол). */
export function applyLimit(sql: string, limit = 500): string {
  // Төгсгөлийн `;` болон хоосон мөрүүдийг хасна.
  const trimmed = sql.trim().replace(/;\s*$/, '').trimEnd()
  if (!needsLimit(trimmed, limit)) return trimmed
  // ⚠️ Шинэ мөр ЗААВАЛ — эс бөгөөс `FROM books` + `LIMIT 500` нь
  // `FROM booksLIMIT 500` болж, синтакс алдаа гарна.
  return `${trimmed}\nLIMIT ${limit}`
}
