import type { DomainId } from '../types'

/**
 * Нэг домэйны бүрэн тодорхойлолт.
 *
 * `ddl` нь PostgreSQL хэл дээр. MySQL болон MongoDB хувилбарыг
 * `mysqlDdl` / `mongoSeed` функцуудаар автоматаар үүсгэнэ
 * (lib/engines/mysql.ts, lib/engines/mongo.ts).
 */
export interface DomainDefinition {
  id: DomainId
  label: string
  /** Хичээлийн ямар долоо хоногт тохирох. */
  weeks: number[]
  description: string
  /** Хүснэгт үүсгэх SQL — PostgreSQL синтакс. */
  ddl: string
  /** Жишээ өгөгдөл үүсгэх SQL — INSERT statement-ууд. */
  seed: string
  /** Хичээлийн 15 асуулга — Week 5-10-ийн сэдвүүдийг хамарна. */
  examples: ExampleQuery[]
  /** Даалгаврууд. */
  challenges: Challenge[]
}

export interface ExampleQuery {
  title: string
  /** Аль долоо хоногийн сэдэв вэ (4-14). */
  week: number
  sql: string
  /** MongoDB хувилбар (байвал). */
  mongo?: string
  explanation: string
  /**
   * Жишээний ангилал — UI-д шүүлтүүр болгож хэрэглэнэ.
   *
   *   ddl         — CREATE / ALTER / DROP TABLE, хязгаар (constraint)
   *   dml         — INSERT / UPDATE / DELETE
   *   query       — SELECT (WHERE, JOIN, нэгтгэх функц, дэд асуулга)
   *   транзакц    — BEGIN / COMMIT / ROLLBACK
   *   view-index  — CREATE VIEW / CREATE INDEX / EXPLAIN
   *   normalization — 1NF / 2NF / 3NF, функциональ хамаарал
   *
   * Заагаагүй бол 'query' гэж үзнэ.
   */
  category?: ExampleCategory
  /**
   * Энэ жишээ нь өгөгдлийг ӨӨРЧИЛНЭ (DDL/DML). UI-д сэрэмжлүүлэг
   * харуулахын тулд. `true` бол «Өгөгдөл сэргээх» товчийг сануулна.
   */
  mutates?: boolean
  /**
   * Хэлбэржүүлэлтийн жишээний үе шат (1NF → 2NF → 3NF).
   * Зөвхөн `category: 'normalization'` үед.
   */
  step?: 'before' | '1nf' | '2nf' | '3nf'
}

export type ExampleCategory =
  | 'ddl'
  | 'dml'
  | 'query'
  | 'transaction'
  | 'view-index'
  | 'normalization'

/** Ангилалын монгол шошго — UI-д. */
export const CATEGORY_LABELS: Record<ExampleCategory, string> = {
  ddl: 'Хүснэгт (DDL)',
  dml: 'Мөр (DML)',
  query: 'Асуулга',
  transaction: 'Транзакц',
  'view-index': 'View / Index',
  normalization: 'Нормалчлал',
}

/** Ангилалын товч тайлбар — tooltip-д. */
export const CATEGORY_DESCRIPTIONS: Record<ExampleCategory, string> = {
  ddl: 'CREATE, ALTER, DROP TABLE — хүснэгтийн бүтэц',
  dml: 'INSERT, UPDATE, DELETE — мөр нэмэх, засах, устгах',
  query: 'SELECT — өгөгдөл унших (WHERE, JOIN, нэгтгэх функц)',
  transaction: 'BEGIN, COMMIT, ROLLBACK — ACID',
  'view-index': 'CREATE VIEW, CREATE INDEX, EXPLAIN',
  normalization: '1NF, 2NF, 3NF — давхардал ба гажиг (anomaly)',
}

export interface Challenge {
  id: string
  title: string
  /** Хүүхэд юу хийх ёстой вэ. */
  task: string
  /** Зөв хариултын шалгуур — буцаагдсан мөрийн тоо. */
  expectedRowCount?: number
  /** Хэрэв тийм бол яг энэ багана байх ёстой. */
  expectedColumns?: string[]
  hint: string
  solution: string
}
