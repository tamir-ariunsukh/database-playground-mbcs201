import { describe, expect, it } from 'vitest'
import { DOMAINS, getDomain } from './index'
import { CATEGORY_LABELS, type ExampleCategory } from './types'

/**
 * Жишээнүүдийн ангилал, DDL/DML/нормалчлалын бүрэн бүтэн байдлыг шалгана.
 *
 * Эдгээр тест нь:
 *   1. Ангилал бүр хүчинтэй эсэх
 *   2. DDL/DML/нормалчлалын жишээ байгаа эсэх
 *   3. Дата өөрчлөх жишээ `mutates: true` тэмдэгтэй эсэх
 *   4. Нормалчлалын 4 үе шат бүрэн эсэх
 *   5. SQL нь синтакс алдаагүй эсэх
 */

const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS) as ExampleCategory[]

describe('Жишээний ангилал', () => {
  it('бүх ангилал хүчинтэй', () => {
    for (const d of DOMAINS) {
      for (const ex of d.examples) {
        const c = ex.category ?? 'query'
        expect(VALID_CATEGORIES).toContain(c)
      }
    }
  })

  it('бүх ангилалд монгол шошго байна', () => {
    for (const c of VALID_CATEGORIES) {
      expect(CATEGORY_LABELS[c].length).toBeGreaterThan(2)
    }
  })

  it('DDL жишээ байна', () => {
    const total = DOMAINS.flatMap((d) => d.examples).filter((e) => e.category === 'ddl')
    expect(total.length).toBeGreaterThanOrEqual(5)
  })

  it('DML жишээ байна', () => {
    const total = DOMAINS.flatMap((d) => d.examples).filter((e) => e.category === 'dml')
    expect(total.length).toBeGreaterThanOrEqual(5)
  })

  it('нормалчлалын жишээ байна', () => {
    const total = DOMAINS.flatMap((d) => d.examples).filter(
      (e) => e.category === 'normalization',
    )
    expect(total.length).toBeGreaterThanOrEqual(4)
  })

  it('transaction жишээ байна', () => {
    const total = DOMAINS.flatMap((d) => d.examples).filter(
      (e) => e.category === 'transaction',
    )
    expect(total.length).toBeGreaterThanOrEqual(3)
  })
})

describe('mutates тэмдэг', () => {
  it('CREATE/DROP/ALTER/INSERT/UPDATE/DELETE жишээ mutates=true', () => {
    const patterns: [RegExp, string][] = [
      [/^\s*CREATE\s+TABLE/im, 'CREATE TABLE'],
      [/^\s*DROP\s+TABLE/im, 'DROP TABLE'],
      [/^\s*ALTER\s+TABLE/im, 'ALTER TABLE'],
      [/^\s*INSERT\s+INTO/im, 'INSERT'],
      [/^\s*UPDATE\s+\w/im, 'UPDATE'],
      [/^\s*DELETE\s+FROM/im, 'DELETE'],
    ]

    const misses: string[] = []
    for (const d of DOMAINS) {
      for (const ex of d.examples) {
        // `SELECT`-ээр эхэлсэн жишээг алгасна (зөвхөн цэвэр уншилт).
        for (const [re, name] of patterns) {
          if (re.test(ex.sql) && !ex.mutates) {
            misses.push(`${d.id}: "${ex.title}" (${name})`)
          }
        }
      }
    }

    expect(misses).toEqual([])
  })
})

describe('Нормалчлалын үе шатууд', () => {
  it('0NF → 1NF → 2NF → 3NF бүрэн байна', () => {
    const steps = DOMAINS.flatMap((d) => d.examples)
      .filter((e) => e.category === 'normalization')
      .map((e) => e.step)
      .filter(Boolean)

    expect(steps).toContain('before')
    expect(steps).toContain('1nf')
    expect(steps).toContain('2nf')
    expect(steps).toContain('3nf')
  })

  it('зөвхөн нормалчлалын жишээнд step байна', () => {
    for (const d of DOMAINS) {
      for (const ex of d.examples) {
        if (ex.step && ex.category !== 'normalization') {
          throw new Error(`${d.id}: "${ex.title}" нь ${ex.category} боловч step-тэй`)
        }
      }
    }
  })

  it('нормалчлалын жишээ Week 11-д байна', () => {
    const norm = DOMAINS.flatMap((d) => d.examples).filter(
      (e) => e.category === 'normalization',
    )
    for (const ex of norm) {
      expect(ex.week).toBe(11)
    }
  })
})

describe('DML бүрэн байдал', () => {
  const lib = getDomain('library')!

  it('INSERT жишээ байна', () => {
    expect(lib.examples.some((e) => /^\s*INSERT\s+INTO/im.test(e.sql))).toBe(true)
  })

  it('UPDATE жишээ байна', () => {
    expect(lib.examples.some((e) => /^\s*UPDATE\s+\w/im.test(e.sql))).toBe(true)
  })

  it('DELETE жишээ байна', () => {
    expect(lib.examples.some((e) => /^\s*DELETE\s+FROM/im.test(e.sql))).toBe(true)
  })

  it('UPDATE нь WHERE-ийн аюулыг тайлбарласан', () => {
    const upd = lib.examples.find((e) => /^\s*UPDATE\s+\w/im.test(e.sql))
    expect(upd?.explanation).toMatch(/WHERE/)
  })

  it('DELETE нь WHERE-ийн аюулыг тайлбарласан', () => {
    const del = lib.examples.find((e) => /^\s*DELETE\s+FROM/im.test(e.sql))
    expect(del?.explanation).toMatch(/WHERE/)
  })

  it('UPSERT жишээ байна (ON CONFLICT)', () => {
    const all = DOMAINS.flatMap((d) => d.examples)
    expect(all.some((e) => /ON CONFLICT/i.test(e.sql))).toBe(true)
  })

  it('INSERT ... SELECT жишээ байна', () => {
    const all = DOMAINS.flatMap((d) => d.examples)
    expect(all.some((e) => /INSERT\s+INTO[\s\S]*?\nSELECT/im.test(e.sql))).toBe(true)
  })

  it('UPDATE ... FROM жишээ байна', () => {
    const all = DOMAINS.flatMap((d) => d.examples)
    expect(all.some((e) => /UPDATE\s+\w+\s+\w+\s*\nSET[\s\S]*?\nFROM/im.test(e.sql))).toBe(
      true,
    )
  })
})

describe('DDL бүрэн байдал', () => {
  const lib = getDomain('library')!

  it('CREATE TABLE жишээ байна', () => {
    expect(lib.examples.some((e) => /^\s*CREATE\s+TABLE/im.test(e.sql))).toBe(true)
  })

  it('ALTER TABLE ADD COLUMN жишээ байна', () => {
    expect(lib.examples.some((e) => /ALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN/i.test(e.sql))).toBe(
      true,
    )
  })

  it('ALTER TABLE DROP COLUMN жишээ байна', () => {
    expect(lib.examples.some((e) => /DROP\s+COLUMN/i.test(e.sql))).toBe(true)
  })

  it('ALTER COLUMN TYPE жишээ байна', () => {
    expect(lib.examples.some((e) => /ALTER\s+COLUMN\s+\w+\s+TYPE/i.test(e.sql))).toBe(true)
  })

  it('ADD CONSTRAINT жишээ байна', () => {
    expect(lib.examples.some((e) => /ADD\s+CONSTRAINT/i.test(e.sql))).toBe(true)
  })

  it('DROP CONSTRAINT жишээ байна', () => {
    expect(lib.examples.some((e) => /DROP\s+CONSTRAINT/i.test(e.sql))).toBe(true)
  })

  it('DROP TABLE жишээ байна', () => {
    expect(lib.examples.some((e) => /^\s*DROP\s+TABLE/im.test(e.sql))).toBe(true)
  })

  it('pg_constraint системийн хүснэгт ашигласан', () => {
    expect(lib.examples.some((e) => /pg_constraint/.test(e.sql))).toBe(true)
  })
})

describe('SQL синтакс чанар', () => {
  it('хаалт тэнцүү (string literal-ийг тооцохгүй)', () => {
    for (const d of DOMAINS) {
      for (const ex of d.examples) {
        // Тайлбар болон string-ийг арилгана
        const code = ex.sql
          .split('\n')
          .filter((l) => !/^\s*--/.test(l))
          .join('\n')
          .replace(/'[^']*'/g, "''")

        const open = (code.match(/\(/g) ?? []).length
        const close = (code.match(/\)/g) ?? []).length
        if (open !== close) {
          throw new Error(
            `${d.id}: "${ex.title}" — хаалт тэнцүүгүй (${open} нээсэн, ${close} хаасан)`,
          )
        }
      }
    }
  })

  it('жишээ бүр тайлбартай', () => {
    for (const d of DOMAINS) {
      for (const ex of d.examples) {
        expect(ex.explanation.length).toBeGreaterThan(20)
      }
    }
  })

  it('нормалчлалын тайлбар нь үе шатаа дурдсан', () => {
    const norm = DOMAINS.flatMap((d) => d.examples).filter(
      (e) => e.category === 'normalization',
    )
    for (const ex of norm) {
      expect(ex.explanation).toMatch(/1NF|2NF|3NF|anomaly|давхардал/)
    }
  })
})

describe('Ангилалын тоо', () => {
  it('Library нь 6 ангилалтай', () => {
    const lib = getDomain('library')!
    const cats = new Set(lib.examples.map((e) => e.category ?? 'query'))
    expect(cats.size).toBe(6)
  })

  it('Library-д 30+ жишээ байна', () => {
    expect(getDomain('library')!.examples.length).toBeGreaterThanOrEqual(30)
  })

  it('нийт жишээний тоо 80+', () => {
    const total = DOMAINS.reduce((s, d) => s + d.examples.length, 0)
    expect(total).toBeGreaterThanOrEqual(80)
  })
})
