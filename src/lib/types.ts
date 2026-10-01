/**
 * Нийтлэг төрлүүд — бүх engine (Postgres, MySQL, MongoDB) эдгээрийг хэрэглэнэ.
 */

export type DbKind = 'postgres' | 'mysql' | 'mongodb'

export type CellValue = string | number | boolean | null | object | unknown[]

/** Асуулгын үр дүн — бүх engine ижил хэлбэрээр буцаана. */
export interface QueryResult {
  /** Баганын нэрс (MongoDB-д талбарын зам). */
  columns: string[]
  /** Мөрүүд — объект хэлбэрээр. */
  rows: Record<string, CellValue>[]
  /** Нийт буцаагдсан мөрийн тоо. */
  rowCount: number
  /** Гүйцэтгэлийн хугацаа (мс). */
  durationMs: number
  /** Хэрэв LIMIT автоматаар нэмэгдсэн бол true. */
  truncated: boolean
  /** DDL/DML үед нөлөөлсөн мөрийн тоо. */
  affectedRows?: number
  /** Хэрэглэгчид харуулах нэмэлт мэдээлэл (жишээ нь "CREATE TABLE"). */
  notice?: string
}

/** Асуулгын алдаа — engine-ээс хамаарахгүй нэгдсэн хэлбэр. */
export class QueryError extends Error {
  readonly dbKind: DbKind
  readonly detail?: string
  readonly hint?: string
  readonly position?: number

  constructor(
    message: string,
    dbKind: DbKind,
    opts: { detail?: string; hint?: string; position?: number } = {},
  ) {
    super(message)
    this.name = 'QueryError'
    this.dbKind = dbKind
    this.detail = opts.detail
    this.hint = opts.hint
    this.position = opts.position
  }
}

/** Хүснэгтийн баганын мета өгөгдөл. */
export interface ColumnMeta {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  isForeignKey: boolean
  references?: { table: string; column: string }
  default?: string
}

/** Хүснэгтийн мета өгөгдөл — schema explorer-т хэрэглэнэ. */
export interface TableMeta {
  name: string
  columns: ColumnMeta[]
  rowCount: number
  comment?: string
}

/** Бүрэн schema — нэг домэйны бүх хүснэгт. */
export interface SchemaMeta {
  domain: DomainId
  label: string
  description: string
  tables: TableMeta[]
}

export type DomainId = 'library' | 'shop' | 'hospital' | 'university' | 'hotel'

/** Хэрэглэгчийн асуулгыг engine-д дамжуулахын өмнөх шалгалтын хариу. */
export interface GuardVerdict {
  allowed: boolean
  /** Зөвшөөрөгдөөгүй бол шалтгаан (монголоор). */
  reason?: string
  /** Илэрсэн аюултай хэв маяг. */
  matched?: string
  /** Санал болгох засвар. */
  suggestion?: string
}
