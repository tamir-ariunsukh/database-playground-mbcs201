import { describe, expect, it } from 'vitest'
import {
  applyLimit,
  guardMongo,
  guardSql,
  needsLimit,
  splitStatements,
  stripLiteralsAndComments,
} from './guard'

describe('stripLiteralsAndComments', () => {
  it('мөрийн comment-ийг арилгана', () => {
    expect(stripLiteralsAndComments('SELECT 1 -- DROP DATABASE')).not.toContain('DROP')
  })

  it('блок comment-ийг арилгана', () => {
    expect(stripLiteralsAndComments('SELECT /* DROP TABLE */ 1')).not.toContain('DROP')
  })

  it('string literal-ийг арилгана', () => {
    const out = stripLiteralsAndComments("SELECT 'DROP DATABASE' AS x")
    expect(out).not.toContain('DROP DATABASE')
  })

  it('давхар quote-той string-ийг зөв боловсруулна', () => {
    const out = stripLiteralsAndComments("SELECT 'it''s a test' FROM t")
    expect(out).toContain('FROM t')
    expect(out).not.toContain('test')
  })

  it('dollar-quoted блокийг арилгана', () => {
    const out = stripLiteralsAndComments('SELECT $$ DROP TABLE x; $$ AS body')
    expect(out).not.toContain('DROP')
  })

  it('backtick identifier-ийг арилгана', () => {
    const out = stripLiteralsAndComments('SELECT `name` FROM `books`')
    expect(out).toContain('FROM')
  })
})

describe('guardSql', () => {
  it('энгийн SELECT-ийг зөвшөөрнө', () => {
    expect(guardSql('SELECT * FROM books').allowed).toBe(true)
  })

  it('SELECT-ийг string дотор бичсэн DROP-той зөвшөөрнө', () => {
    expect(guardSql("SELECT 'DROP DATABASE' AS msg").allowed).toBe(true)
  })

  it('DROP DATABASE-ийг хориглоно', () => {
    const v = guardSql('DROP DATABASE mydb')
    expect(v.allowed).toBe(false)
    expect(v.suggestion).toBeTruthy()
  })

  it('COMMENT дотор нуугдсан DROP DATABASE-ийг хориглоно', () => {
    const v = guardSql('/* hi */ DROP DATABASE mydb')
    expect(v.allowed).toBe(false)
  })

  it('COPY ... FROM PROGRAM-ийг хориглоно', () => {
    const v = guardSql("COPY t FROM PROGRAM 'rm -rf /'")
    expect(v.allowed).toBe(false)
  })

  it('pg_read_file дуудалтыг хориглоно', () => {
    expect(guardSql("SELECT pg_read_file('/etc/passwd')").allowed).toBe(false)
  })

  it('олон statement-ийг зөвшөөрнө (нормалчлал, seed-д)', () => {
    const v = guardSql('DROP TABLE IF EXISTS t; CREATE TABLE t (id INT); INSERT INTO t VALUES (1);')
    expect(v.allowed).toBe(true)
  })

  it('олон statement дотор хориглосон байвал БҮГДИЙГ хориглоно', () => {
    const v = guardSql('SELECT 1; DROP DATABASE mydb')
    expect(v.allowed).toBe(false)
    expect(v.reason).toContain('DROP DATABASE')
  })

  it('олон statement дотор pg_read_file байвал хориглоно', () => {
    const v = guardSql("CREATE TABLE t (id INT); SELECT pg_read_file('/etc/passwd')")
    expect(v.allowed).toBe(false)
    expect(v.reason).toContain('2-р statement')
  })

  it('string доторх ; нь statement хуваахгүй', () => {
    expect(splitStatements("INSERT INTO t (note) VALUES ('a; b; c')")).toHaveLength(1)
  })

  it('нормалчлалын бүрэн жишээ ажиллана', () => {
    const sql = `DROP TABLE IF EXISTS loans_1nf;
CREATE TABLE loans_1nf (
  loan_id SERIAL PRIMARY KEY,
  member_name VARCHAR(100) NOT NULL,
  book_title VARCHAR(200) NOT NULL
);
INSERT INTO loans_1nf (member_name, book_title) VALUES ('Бат', 'Ном А'), ('Сараа', 'Ном Б');
SELECT * FROM loans_1nf ORDER BY loan_id;`
    expect(guardSql(sql).allowed).toBe(true)
    expect(splitStatements(sql)).toHaveLength(4)
  })

  it('CREATE EXTENSION-ийг хориглоно', () => {
    expect(guardSql('CREATE EXTENSION plpython3u').allowed).toBe(false)
  })

  it('хоосон query-г хориглоно', () => {
    expect(guardSql('   ').allowed).toBe(false)
  })

  it('CREATE TABLE-ийг зөвшөөрнө', () => {
    expect(guardSql('CREATE TABLE t (id INT)').allowed).toBe(true)
  })

  it('WITH (CTE)-ийг зөвшөөрнө', () => {
    expect(guardSql('WITH x AS (SELECT 1) SELECT * FROM x').allowed).toBe(true)
  })
})

describe('splitStatements', () => {
  it('нэг statement', () => {
    expect(splitStatements('SELECT 1')).toEqual(['SELECT 1'])
  })

  it('гурван statement', () => {
    expect(splitStatements('SELECT 1; SELECT 2; SELECT 3')).toHaveLength(3)
  })

  it('төгсгөлийн ; нь хоосон statement үүсгэхгүй', () => {
    expect(splitStatements('SELECT 1; SELECT 2;')).toHaveLength(2)
  })

  it('string literal доторх ; хамгаалагдана', () => {
    expect(splitStatements("SELECT 'a;b' AS x")).toHaveLength(1)
  })

  it('doubled quote escape-тэй string', () => {
    expect(splitStatements("SELECT 'it''s; ok' AS x")).toHaveLength(1)
  })

  it('dollar-quoted блок доторх ; хамгаалагдана', () => {
    expect(splitStatements('SELECT $$ a; b; c $$ AS x')).toHaveLength(1)
  })

  it('comment хадгалагдана (тайлбар хэрэгтэй)', () => {
    expect(splitStatements('-- тайлбар\nSELECT 1')[0]).toContain('-- тайлбар')
  })

  it('хоосон string-д хоосон массив', () => {
    expect(splitStatements('')).toEqual([])
    expect(splitStatements('   ')).toEqual([])
  })

  it('зөвхөн ; -д хоосон массив', () => {
    expect(splitStatements(';;;')).toEqual([])
  })
})

describe('guardMongo', () => {
  it('энгийн find-ийг зөвшөөрнө', () => {
    expect(guardMongo('db.books.find({ year: { $gt: 2000 } })').allowed).toBe(true)
  })

  it('aggregate pipeline-ийг зөвшөөрнө', () => {
    expect(
      guardMongo('db.books.aggregate([{ $group: { _id: "$cat", n: { $sum: 1 } } }])').allowed,
    ).toBe(true)
  })

  it('$where-ийг хориглоно', () => {
    expect(guardMongo('db.books.find({ $where: "this.x > 1" })').allowed).toBe(false)
  })

  it('mapReduce-ийг хориглоно', () => {
    expect(guardMongo('db.books.mapReduce(f, r, {})').allowed).toBe(false)
  })
})

describe('needsLimit / applyLimit', () => {
  it('LIMIT байхгүй SELECT-д true', () => {
    expect(needsLimit('SELECT * FROM books')).toBe(true)
  })

  it('LIMIT байгаа SELECT-д false', () => {
    expect(needsLimit('SELECT * FROM books LIMIT 10')).toBe(false)
  })

  it('INSERT-д false', () => {
    expect(needsLimit('INSERT INTO t VALUES (1)')).toBe(false)
  })

  it('LIMIT нэмнэ', () => {
    const out = applyLimit('SELECT * FROM books', 500)
    expect(out).toContain('LIMIT 500')
    // ⚠️ LIMIT нь шинэ мөрөнд байх ёстой — эс бөгөөс
    // `FROM booksLIMIT 500` болж синтакс алдаа гарна.
    expect(out).toBe('SELECT * FROM books\nLIMIT 500')
  })

  it('байгаа LIMIT-ийг хадгална', () => {
    const out = applyLimit('SELECT * FROM books LIMIT 10', 500)
    expect(out).toContain('LIMIT 10')
    expect(out).not.toContain('LIMIT 500')
  })

  it('statement-ийн төгсгөлийн ; -г хасна', () => {
    const out = applyLimit('SELECT * FROM books;', 100)
    expect(out).not.toMatch(/;\s*$/)
  })

  it('олон мөрт query-д LIMIT-ийг зөв нэмнэ', () => {
    const out = applyLimit('SELECT title,\n       price\nFROM books\nWHERE price > 100', 50)
    expect(out).toMatch(/WHERE price > 100\nLIMIT 50$/)
    // Урд талын мөрүүд хадгалагдана.
    expect(out).toContain('SELECT title,')
  })
})
