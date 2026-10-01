import { describe, expect, it } from 'vitest'
import { DOMAINS, getDomain } from './index'

describe('Domain тодорхойлолт', () => {
  it('5 domain байна', () => {
    expect(DOMAINS).toHaveLength(5)
  })

  it('ID-ууд давхцахгүй', () => {
    const ids = DOMAINS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('domain бүр DDL, seed, example, challenge-тай', () => {
    for (const d of DOMAINS) {
      expect(d.ddl.length).toBeGreaterThan(100)
      expect(d.seed.length).toBeGreaterThan(1000)
      expect(d.examples.length).toBeGreaterThanOrEqual(10)
      expect(d.challenges.length).toBeGreaterThanOrEqual(5)
    }
  })

  it('domain бүрийн DDL нь CREATE TABLE агуулна', () => {
    for (const d of DOMAINS) {
      expect(d.ddl).toMatch(/CREATE TABLE/i)
    }
  })

  it('domain бүрийн seed нь INSERT агуулна', () => {
    for (const d of DOMAINS) {
      expect(d.seed).toMatch(/INSERT INTO/i)
    }
  })

  it('example бүр week 4-14 хооронд', () => {
    for (const d of DOMAINS) {
      for (const ex of d.examples) {
        expect(ex.week).toBeGreaterThanOrEqual(4)
        expect(ex.week).toBeLessThanOrEqual(14)
        expect(ex.title.length).toBeGreaterThan(0)
        expect(ex.sql.length).toBeGreaterThan(10)
      }
    }
  })

  it('challenge бүр hint болон solution-той', () => {
    for (const d of DOMAINS) {
      for (const c of d.challenges) {
        expect(c.hint.length).toBeGreaterThan(0)
        expect(c.solution.length).toBeGreaterThan(10)
      }
    }
  })

  it('libray domain-ийг ID-аар олно', () => {
    expect(getDomain('library')?.label).toBe('Номын сан')
  })

  it('байхгүй domain-д undefined', () => {
    expect(getDomain('nonexistent')).toBeUndefined()
  })
})

describe('Seed тогтвортой байдал', () => {
  it('нэг domain-ийг хоёр удаа үүсгэхэд ижил seed гарна', async () => {
    // Энэ нь module cache-ийг ашиглаж, ижил объект буцаахыг шалгана.
    const a = getDomain('library')!.seed
    const b = getDomain('library')!.seed
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThan(10000)
  })

  it('seed нь SQL-д аюулгүй (quote escape хийгдсэн)', () => {
    for (const d of DOMAINS) {
      // Тэнцэхгүй тооны quote байх ёсгүй — '' хэлбэрээр escape хийнэ.
      const singles = (d.seed.match(/'/g) ?? []).length
      expect(singles % 2).toBe(0)
    }
  })

  it('seed-д NULL утга байна (NULL дасгал хийхэд)', () => {
    for (const d of DOMAINS) {
      expect(d.seed).toContain('NULL')
    }
  })
})

describe('Хичээлийн шаардлага хангасан эсэх', () => {
  it('JOIN жишээ байна', () => {
    const hasJoin = DOMAINS.some((d) =>
      d.examples.some((e) => /\bJOIN\b/i.test(e.sql)),
    )
    expect(hasJoin).toBe(true)
  })

  it('aggregate жишээ байна', () => {
    const hasAgg = DOMAINS.some((d) =>
      d.examples.some((e) => /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(e.sql)),
    )
    expect(hasAgg).toBe(true)
  })

  it('subquery жишээ байна', () => {
    const hasSub = DOMAINS.some((d) =>
      d.examples.some((e) => /\(SELECT/i.test(e.sql)),
    )
    expect(hasSub).toBe(true)
  })

  it('VIEW жишээ байна', () => {
    const hasView = DOMAINS.some((d) =>
      d.examples.some((e) => /CREATE\s+VIEW/i.test(e.sql)),
    )
    expect(hasView).toBe(true)
  })

  it('transaction жишээ байна', () => {
    const hasTx = DOMAINS.some((d) =>
      d.examples.some((e) => /\bBEGIN\b/i.test(e.sql)),
    )
    expect(hasTx).toBe(true)
  })

  it('MongoDB хувилбартай жишээ байна', () => {
    const withMongo = DOMAINS.flatMap((d) => d.examples).filter((e) => e.mongo)
    expect(withMongo.length).toBeGreaterThanOrEqual(5)
  })

  it('CHECK хязгаарын жишээ байна', () => {
    const hasCheck = DOMAINS.some((d) =>
      d.examples.some((e) => /CHECK хязгаар/i.test(e.explanation)),
    )
    expect(hasCheck).toBe(true)
  })
})
