import { describe, expect, it } from 'vitest'
import { parseMongoQuery } from './mongo'

describe('parseMongoQuery', () => {
  it('энгийн find-ийг parse хийнэ', () => {
    const r = parseMongoQuery('db.books.find({})')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.collection).toBe('books')
    expect(r.operation).toBe('find')
    expect(r.args).toHaveLength(1)
  })

  it('filter-тэй find', () => {
    const r = parseMongoQuery('db.books.find({ price: { $gt: 30000 } })')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.args[0]).toEqual({ price: { $gt: 30000 } })
  })

  it('chained sort, limit, skip-ийг уншина', () => {
    const r = parseMongoQuery('db.books.find({}).sort({ price: -1 }).limit(10).skip(5)')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.chain.sort).toEqual({ price: -1 })
    expect(r.chain.limit).toBe(10)
    expect(r.chain.skip).toBe(5)
  })

  it('aggregate pipeline-ийг parse хийнэ', () => {
    const r = parseMongoQuery(
      'db.books.aggregate([{ $group: { _id: "$cat", n: { $sum: 1 } } }])',
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.operation).toBe('aggregate')
    expect(Array.isArray(r.args[0])).toBe(true)
  })

  it('countDocuments-ийг parse хийнэ', () => {
    const r = parseMongoQuery('db.books.countDocuments({ price: { $gt: 100 } })')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.operation).toBe('countDocuments')
  })

  it('db. prefix байхгүй бол алдаа', () => {
    const r = parseMongoQuery('books.find({})')
    expect(r.ok).toBe(false)
  })

  it('хаалт хаагдаагүй бол алдаа', () => {
    const r = parseMongoQuery('db.books.find({ price: 1 }')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain('Хаалт')
  })

  it('төгсгөлийн ; -г алгасна', () => {
    const r = parseMongoQuery('db.books.find({});')
    expect(r.ok).toBe(true)
  })

  it('string доторх хаалтыг буруу тоолохгүй', () => {
    const r = parseMongoQuery('db.books.find({ title: "Test (2024)" })')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.args[0]).toEqual({ title: 'Test (2024)' })
  })

  it('nested bracket-ийг зөв тоолно', () => {
    const r = parseMongoQuery('db.b.aggregate([{ $match: { a: { $in: [1, 2, 3] } } }])')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.operation).toBe('aggregate')
  })

  it('projection-той find', () => {
    const r = parseMongoQuery('db.books.find({ price: { $gt: 100 } }, { title: 1, price: 1 })')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.args).toHaveLength(2)
    expect(r.args[1]).toEqual({ title: 1, price: 1 })
  })

  it('findOne-ийг parse хийнэ', () => {
    const r = parseMongoQuery('db.books.findOne({ book_id: 5 })')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.operation).toBe('findOne')
  })
})
