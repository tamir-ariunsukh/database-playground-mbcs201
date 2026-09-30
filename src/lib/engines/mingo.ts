'use client'

/**
 * mingo-гийн нэг цэгээс ачаалах модуль.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ЯАГААД ЭНЭ ФАЙЛ ХЭРЭГТЭЙ ВЭ
 * ═══════════════════════════════════════════════════════════════════
 *
 * mingo нь "tree-shakeable" байдлаар бичигдсэн. Энэ нь гэсэн үг:
 *
 *   import { aggregate } from 'mingo'
 *   aggregate(docs, [{ $group: { ... } }])
 *   // ❌ Error: unregistered pipeline operator $group
 *
 * Учир нь `$group`, `$sort`, `$project`, `$lookup`, `$unwind`
 * зэрэг бүх pipeline operator нь үндсэн entry point-д БАЙХГҮЙ.
 * Тэднийг `mingo/init/system` гэсэн side-effect module бүртгэдэг.
 *
 * Асуудал нь: bundler (webpack, Turbopack) нь side-effect import-ийг
 * "хэрэглэгдэхгүй" гэж үзээд tree-shake хийж хаядаг. Ялангуяа
 * `await import('mingo/init/system')` гэж динамик import хийвэл
 * тусдаа chunk болж, ачаалагдах дараалал баталгаагүй болно.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ШИЙДЭЛ
 * ═══════════════════════════════════════════════════════════════════
 *
 * 1. `import 'mingo/init/system'` — СТАТИК import. Bundler үүнийг
 *    устгаж чадахгүй, учир нь статик import нь модулийн graph-д
 *    шууд ордог. Side-effect нь module evaluation үед ажиллана.
 *
 * 2. Дараа нь `from 'mingo'` import хийнэ. ES modules-ийн дүрмээр
 *    бүх import нь бусад кодоос ӨМНӨ ажиллана, тиймээс
 *    `mingo/init/system` нь `mingo`-г ашиглахаас өмнө
 *    бүртгэлээ хийж амжина.
 *
 * 3. `package.json`-д `sideEffects` талбарт энэ файлыг оруулбал
 *    бүр илүү найдвартай (Turbopack ч хүндэтгэнэ).
 *
 * ═══════════════════════════════════════════════════════════════════
 * ТЕСТ
 * ═══════════════════════════════════════════════════════════════════
 *
 * `mingo-init.spec.ts` нь бүх operator бүртгэгдсэн эсэхийг шалгана.
 * Хэрэв bundler ирээдүйд энэ import-ийг дахин tree-shake хийвэл
 * тест унах тул асуудал даруй илэрнэ.
 */

import 'mingo/init/system'
import { Aggregator, Query, aggregate, find, update } from 'mingo'

/**
 * `$lookup` нь нэмэлт тохиргоо шаарддаг.
 *
 * mingo нь `$lookup`-ийн `from` талбарыг хэрхэн шийдэхээ мэдэхгүй —
 * тэр нь өөр collection руу заадаг. mingo-д `collectionResolver`
 * функц өгөх ёстой бөгөөд тэр нь `from` нэрээр документуудыг
 * буцаана.
 *
 * Энэ нь `runMongo()` дотор тохируулагдана — тэнд бүх collection
 * байгаа. Энд зөвхөн интерфэйсийг тодорхойлно.
 */
export interface MingoAggregateOptions {
  collectionResolver?: (name: string) => Record<string, unknown>[]
  variables?: Record<string, unknown>
}

export type MingoApi = {
  Query: typeof Query
  Aggregator: typeof Aggregator
  /** `$lookup`-д зориулж collectionResolver дамжуулж болно. */
  aggregate: (
    collection: Record<string, unknown>[],
    pipeline: Record<string, unknown>[],
    options?: MingoAggregateOptions,
  ) => Record<string, unknown>[]
  find: typeof find
  update: typeof update
}

/**
 * mingo-гийн API-г буцаана.
 *
 * Функц хэлбэрээр боосон нь: bundler нь ашиглагдаагүй export-уудыг
 * tree-shake хийхээс сэргийлж, бүх operator бүртгэгдсэн
 * байдлыг баталгаажуулна.
 */
export function getMingo(): MingoApi {
  return {
    Query,
    Aggregator,
    aggregate: aggregate as unknown as MingoApi['aggregate'],
    find,
    update,
  }
}

export { Query, Aggregator, find, update }

/**
 * `aggregate`-ийг `$lookup` дэмжихээр боосон хувилбар.
 *
 * mingo-гийн `$lookup` нь `options.collectionResolver`-гүй бол
 * `TypeError: options?.collectionResolver is not a function` алдаа
 * өгнө. Бид бүх collection-ийг мэддэг тул resolver-ийг өөрсдөө
 * бичиж өгнө.
 */
export function aggregateWithCollections(
  docs: Record<string, unknown>[],
  pipeline: Record<string, unknown>[],
  collections: Record<string, Record<string, unknown>[]>,
): Record<string, unknown>[] {
  const hasLookup = pipeline.some((stage) => '$lookup' in stage)
  if (!hasLookup) {
    return aggregate(docs, pipeline as never) as Record<string, unknown>[]
  }

  return aggregate(docs, pipeline as never, {
    collectionResolver: (name: string) => collections[name] ?? [],
  } as never) as Record<string, unknown>[]
}
