import { describe, expect, it } from 'vitest'
import { aggregate, Query } from 'mingo'
import 'mingo/init/system'
import { aggregateWithCollections } from './mingo'

/**
 * mingo-гийн operator бүртгэлийг шалгана.
 *
 * ⚠️ mingo нь "tree-shakeable" — pipeline operator-ууд ($group, $sort,
 * $project, $lookup) нь үндсэн entry point-д БАЙХГҮЙ. Тэднийг
 * `mingo/init/system` side-effect module ачаалж бүртгэдэг.
 *
 * Энэ тест нь тэр бүртгэл ажиллаж байгааг, мөн ямар operator-ууд
 * байгааг батална. Хэрэв bundler (Turbopack) side-effect import-ийг
 * tree-shake хийвэл энэ тест унана.
 */

const data = [
  { category: 'a', price: 10 },
  { category: 'b', price: 20 },
  { category: 'a', price: 30 },
]

describe('mingo operator бүртгэл', () => {
  it('$group ажиллана', () => {
    const r = aggregate(data, [
      { $group: { _id: '$category', n: { $sum: 1 }, total: { $sum: '$price' } } },
    ])
    expect(r).toHaveLength(2)
    const a = r.find((x) => (x as { _id: string })._id === 'a') as { n: number; total: number }
    expect(a.n).toBe(2)
    expect(a.total).toBe(40)
  })

  it('$group + $sort ажиллана', () => {
    const r = aggregate(data, [
      { $group: { _id: '$category', n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    expect(r).toHaveLength(2)
  })

  it('$group + $avg ажиллана (тоо дээр)', () => {
    const r = aggregate(data, [
      { $group: { _id: '$category', avg: { $avg: '$price' } } },
    ]) as { avg: number }[]
    const a = r.find((x) => (x as unknown as { _id: string })._id === 'a')!
    expect(a.avg).toBe(20)
  })

  it('$group + $min/$max ажиллана', () => {
    const r = aggregate(data, [
      { $group: { _id: '$category', lo: { $min: '$price' }, hi: { $max: '$price' } } },
    ]) as { lo: number; hi: number }[]
    const a = r.find((x) => (x as unknown as { _id: string })._id === 'a')!
    expect(a.lo).toBe(10)
    expect(a.hi).toBe(30)
  })

  it('$match ажиллана', () => {
    const r = aggregate(data, [{ $match: { category: 'a' } }])
    expect(r).toHaveLength(2)
  })

  it('$project ажиллана', () => {
    const r = aggregate(data, [
      { $match: { category: 'a' } },
      { $project: { _id: 0, price: 1 } },
    ])
    expect(r).toHaveLength(2)
    expect(Object.keys(r[0] as object)).toEqual(['price'])
  })

  it('$limit + $skip ажиллана', () => {
    expect(aggregate(data, [{ $limit: 2 }])).toHaveLength(2)
    expect(aggregate(data, [{ $skip: 1 }])).toHaveLength(2)
  })

  it('$unwind ажиллана', () => {
    const nested = [{ tags: ['x', 'y'] }, { tags: ['z'] }]
    const r = aggregate(nested, [{ $unwind: '$tags' }])
    expect(r).toHaveLength(3)
  })

  it('$lookup ажиллана (collectionResolver-той)', () => {
    // ⚠️ mingo-гийн `$lookup` нь `collectionResolver` шаарддаг —
    // үгүй бол "options?.collectionResolver is not a function" алдаа.
    const other = [{ k: 'a', label: 'Alpha' }]
    const r = aggregateWithCollections(
      data,
      [
        { $match: { category: 'a' } },
        { $limit: 1 },
        {
          $lookup: {
            from: 'other',
            localField: 'category',
            foreignField: 'k',
            as: 'joined',
          },
        },
      ],
      { other },
    )
    expect(r).toHaveLength(1)
    expect((r[0] as { joined: unknown[] }).joined).toHaveLength(1)
  })

  it('$lookup collectionResolver-гүй бол алдаа өгнө', () => {
    // Энэ нь mingo-гийн бодит зан төлөвийг батална — бид үүнээс
    // сэргийлж `aggregateWithCollections` ашигладаг.
    expect(() =>
      aggregate(data, [
        { $lookup: { from: 'other', localField: 'a', foreignField: 'b', as: 'j' } },
      ]),
    ).toThrow()
  })

  it('$count ажиллана', () => {
    const r = aggregate(data, [{ $count: 'total' }]) as { total: number }[]
    expect(r[0].total).toBe(3)
  })

  it('Query.find() ажиллана', () => {
    const r = new Query({ category: 'a' }).find(data).all()
    expect(r).toHaveLength(2)
  })

  it('Query.find() проекцтой ажиллана', () => {
    const r = new Query({ category: 'a' }).find(data, { _id: 0, price: 1 }).all()
    expect(Object.keys(r[0] as object)).toEqual(['price'])
  })
})
