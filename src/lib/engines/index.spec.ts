import { beforeAll, describe, expect, it } from 'vitest'
import { DOMAINS } from '@/lib/schema'
import { loadDomain, execute, resetCurrentDomain } from './index'

/**
 * Engine интеграцийн тест — browser-ийн WASM орчныг jsdom/node-д дуурайна.
 *
 * Эдгээр тест нь 3 engine бүгд ижил дата дээр ажиллаж байгааг батална.
 * Хамгийн чухал шалгалт: Postgres, MySQL, MongoDB-д ижил тооны мөр байх ёстой.
 */

// PGlite нь node-д ажилладаг (wasm-node build), alasql, mingo ч ажиллана.
const TIMEOUT = 120_000

describe('Engine интеграц', () => {
  beforeAll(async () => {
    await loadDomain('library')
  }, TIMEOUT)

  it('Postgres-д 5 хүснэгт байна', async () => {
    const snap = await loadDomain('library')
    expect(snap.tables).toHaveLength(5)
    expect(snap.tables.map((t) => t.name).sort()).toEqual([
      'authors',
      'books',
      'categories',
      'loans',
      'members',
    ])
  }, TIMEOUT)

  it('Postgres: SELECT ажиллана', async () => {
    const r = await execute('postgres', 'SELECT * FROM books LIMIT 5')
    expect(r.rowCount).toBe(5)
    expect(r.columns).toContain('title')
    expect(r.columns).toContain('price')
  }, TIMEOUT)

  it('Postgres: COUNT(*) 120 ном байна', async () => {
    const r = await execute('postgres', 'SELECT COUNT(*) AS n FROM books')
    expect(Number(r.rows[0].n)).toBe(120)
  }, TIMEOUT)

  it('Postgres: JOIN ажиллана', async () => {
    const r = await execute(
      'postgres',
      `SELECT b.title, a.last_name
       FROM books b JOIN authors a ON b.author_id = a.author_id
       LIMIT 3`,
    )
    expect(r.rowCount).toBe(3)
    expect(r.columns).toEqual(['title', 'last_name'])
  }, TIMEOUT)

  it('Postgres: GROUP BY + HAVING ажиллана', async () => {
    const r = await execute(
      'postgres',
      `SELECT category_id, COUNT(*) AS n FROM books
       GROUP BY category_id HAVING COUNT(*) > 5 ORDER BY n DESC`,
    )
    expect(r.rowCount).toBeGreaterThan(0)
    for (const row of r.rows) {
      expect(Number(row.n)).toBeGreaterThan(5)
    }
  }, TIMEOUT)

  it('Postgres: CHECK constraint алдаа өгнө', async () => {
    await expect(
      execute(
        'postgres',
        `INSERT INTO loans (book_id, member_id, loan_date, due_date)
         VALUES (1, 1, '2025-06-01', '2025-05-01')`,
      ),
    ).rejects.toThrow()
  }, TIMEOUT)

  it('Postgres: LIMIT автоматаар нэмэгдэнэ', async () => {
    // loans-д 220 мөр — LIMIT 500 нэмэгдсэн ч бүх мөр буцаана.
    // 220 < 500 тул `truncated` нь FALSE байх ёстой (бодит таслалт байхгүй).
    const r = await execute('postgres', 'SELECT * FROM loans')
    expect(r.rowCount).toBe(220)
    expect(r.truncated).toBe(false)

    // Бага limit-тай үед бодитоор таслагдана.
    const small = await execute('postgres', 'SELECT * FROM loans', { limit: 50 })
    expect(small.truncated).toBe(true)
    expect(small.rowCount).toBe(50)
  }, TIMEOUT)

  it('Postgres: COUNT(*) нь truncated=true буцаахгүй', async () => {
    // ⚠️ Regression: 1 мөр буцаасан query-д "LIMIT нэмэгдлээ"
    // гэсэн анхааруулга гарах ёсгүй.
    const r = await execute('postgres', 'SELECT COUNT(*) AS n FROM books')
    expect(r.rowCount).toBe(1)
    expect(r.truncated).toBe(false)
  }, TIMEOUT)

  it('MySQL: хүснэгтүүд үүссэн байна', async () => {
    const r = await execute('mysql', 'SELECT * FROM books LIMIT 5')
    expect(r.rowCount).toBe(5)
    expect(r.columns).toContain('title')
  }, TIMEOUT)

  it('MySQL: COUNT нийцнэ (Postgres-той ижил)', async () => {
    const pg = await execute('postgres', 'SELECT COUNT(*) AS n FROM books')
    const my = await execute('mysql', 'SELECT COUNT(*) AS n FROM books')
    expect(Number(my.rows[0].n)).toBe(Number(pg.rows[0].n))
  }, TIMEOUT)

  it('MySQL: JOIN ажиллана', async () => {
    const r = await execute(
      'mysql',
      `SELECT b.title, a.last_name FROM books b
       JOIN authors a ON b.author_id = a.author_id LIMIT 3`,
    )
    expect(r.rowCount).toBe(3)
  }, TIMEOUT)

  it('MySQL: GROUP BY ажиллана', async () => {
    const r = await execute(
      'mysql',
      `SELECT category_id, COUNT(*) AS n FROM books GROUP BY category_id ORDER BY n DESC`,
    )
    expect(r.rowCount).toBeGreaterThan(0)
  }, TIMEOUT)

  it('MongoDB: find ажиллана', async () => {
    const r = await execute('mongodb', 'db.books.find({}).limit(5)')
    expect(r.rowCount).toBe(5)
  }, TIMEOUT)

  it('MongoDB: шүүлтүүр ажиллана', async () => {
    const r = await execute('mongodb', 'db.books.find({ price: { $gt: 30000 } }).limit(10)')
    for (const row of r.rows) {
      expect(Number(row.price)).toBeGreaterThan(30000)
    }
  }, TIMEOUT)

  it('MongoDB: aggregate $group ажиллана', async () => {
    const r = await execute(
      'mongodb',
      `db.books.aggregate([
        { $group: { _id: "$category_id", n: { $sum: 1 } } },
        { $sort: { n: -1 } }
      ])`,
    )
    expect(r.rowCount).toBeGreaterThan(0)
  }, TIMEOUT)

  it('MongoDB: тоо Postgres-той нийцнэ', async () => {
    const pg = await execute('postgres', 'SELECT COUNT(*) AS n FROM books')
    const mg = await execute('mongodb', 'db.books.countDocuments({})')
    expect(Number(mg.rows[0].count)).toBe(Number(pg.rows[0].n))
  }, TIMEOUT)

  it('MongoDB: $avg тоон дээр ажиллана (NUMERIC string биш)', async () => {
    // ⚠️ Regression: Postgres-ийн NUMERIC нь JS-д string болж ирдэг.
    // Хэрэв хөрвүүлэхгүй бол mingo-гийн $avg нь 0 буцаана.
    const r = await execute(
      'mongodb',
      'db.books.aggregate([{ $group: { _id: null, avgPrice: { $avg: "$price" }, total: { $sum: "$price" } } }])',
    )
    const avg = Number(r.rows[0].avgPrice)
    const total = Number(r.rows[0].total)
    expect(avg).toBeGreaterThan(10000)
    expect(total).toBeGreaterThan(avg)
  }, TIMEOUT)

  it('MongoDB: өөрийн .limit() нь truncated=true буцаахгүй', async () => {
    // ⚠️ Regression: хэрэглэгч .limit(20) гэж бичсэн бол
    // "LIMIT нэмэгдлээ" гэсэн анхааруулга гарах ёсгүй —
    // тэр LIMIT-ийг хэрэглэгч өөрөө бичсэн.
    const r = await execute('mongodb', 'db.books.find({}).limit(20)')
    expect(r.rowCount).toBe(20)
    expect(r.truncated).toBe(false)
  }, TIMEOUT)

  it('MongoDB: limit бичихгүй бол автоматаар нэмэгдэнэ', async () => {
    // 500 нь default limit, books-д 120 мөр тул бодит таслалт байхгүй.
    const r = await execute('mongodb', 'db.books.find({})')
    expect(r.rowCount).toBe(120)
    expect(r.truncated).toBe(false)

    // Бага limit-тай бол бодитоор таслагдана.
    const small = await execute('mongodb', 'db.books.find({})', { limit: 10 })
    expect(small.rowCount).toBe(10)
    expect(small.truncated).toBe(true)
  }, TIMEOUT)

  it('MySQL: AVG тоон дээр ажиллана', async () => {
    const r = await execute(
      'mysql',
      'SELECT AVG(price) AS avg_price, SUM(price) AS sum_price FROM books',
    )
    const avg = Number(r.rows[0].avg_price)
    expect(avg).toBeGreaterThan(10000)
    expect(Number(r.rows[0].sum_price)).toBeGreaterThan(avg)
  }, TIMEOUT)

  it('Гурван engine ижил AVG буцаана', async () => {
    const pg = await execute('postgres', 'SELECT ROUND(AVG(price), 0) AS a FROM books')
    const my = await execute('mysql', 'SELECT ROUND(AVG(price), 0) AS a FROM books')
    const mg = await execute(
      'mongodb',
      'db.books.aggregate([{ $group: { _id: null, a: { $avg: "$price" } } }])',
    )

    const pgAvg = Math.round(Number(pg.rows[0].a))
    const myAvg = Math.round(Number(my.rows[0].a))
    const mgAvg = Math.round(Number(mg.rows[0].a))

    expect(myAvg).toBe(pgAvg)
    // MongoDB-ийн $avg нь бүх мөрийг тооцдог тул яг ижил байх ёстой.
    expect(mgAvg).toBe(pgAvg)
  }, TIMEOUT)

  it('Postgres: NUMERIC багана тоо болж буцаана', async () => {
    const r = await execute('postgres', 'SELECT price FROM books LIMIT 1')
    expect(typeof r.rows[0].price).toBe('number')
  }, TIMEOUT)

  // =========================================================================
  // ОЛОН STATEMENT — DDL/DML/нормалчлал
  // =========================================================================

  it('Postgres: олон statement ажиллана (CREATE → INSERT → SELECT)', async () => {
    const r = await execute(
      'postgres',
      `DROP TABLE IF EXISTS multi_test;
       CREATE TABLE multi_test (id SERIAL PRIMARY KEY, name VARCHAR(50) NOT NULL);
       INSERT INTO multi_test (name) VALUES ('Бат'), ('Сараа'), ('Дорж');
       SELECT * FROM multi_test ORDER BY id;`,
    )
    expect(r.rowCount).toBe(3)
    expect(r.columns).toEqual(['id', 'name'])
    expect(r.notice).toContain('4 statement')
  }, TIMEOUT)

  it('Postgres: олон statement-д UPDATE/DELETE ажиллана', async () => {
    await execute(
      'postgres',
      `CREATE TABLE multi_dml (id INT, score INT);
       INSERT INTO multi_dml VALUES (1, 10), (2, 20), (3, 30);`,
    )

    // UPDATE дараа COUNT
    const upd = await execute(
      'postgres',
      `UPDATE multi_dml SET score = 99 WHERE id = 1;
       SELECT score FROM multi_dml WHERE id = 1;`,
    )
    expect(Number(upd.rows[0].score)).toBe(99)

    // DELETE дараа COUNT
    const del = await execute(
      'postgres',
      `DELETE FROM multi_dml WHERE id = 3;
       SELECT COUNT(*) AS n FROM multi_dml;`,
    )
    expect(Number(del.rows[0].n)).toBe(2)

    // DROP
    const drop = await execute('postgres', 'DROP TABLE multi_dml')
    expect(drop.columns).toHaveLength(0)
    expect(drop.notice).toMatch(/устлаа|устга|DROP/i)
  }, TIMEOUT)

  it('Postgres: QUIZ — олон statement-д хориглосон байвал унана', async () => {
    await expect(
      execute('postgres', 'SELECT 1; DROP DATABASE postgres'),
    ).rejects.toThrow(/DROP DATABASE/)
  }, TIMEOUT)

  it('Postgres: нормалчлалын 0NF → 1NF бүрэн ажиллана', async () => {
    // 0NF — зориуд буруу хүснэгт
    const zero = await execute(
      'postgres',
      `DROP TABLE IF EXISTS nf0;
       CREATE TABLE nf0 (
         loan_id SERIAL PRIMARY KEY,
         member_name VARCHAR(100),
         book_titles TEXT,
         loan_dates TEXT
       );
       INSERT INTO nf0 (member_name, book_titles, loan_dates) VALUES
         ('Бат', 'Ном А, Ном Б', '2025-01-01, 2025-01-15');
       SELECT * FROM nf0;`,
    )
    expect(zero.rowCount).toBe(1)
    // ⚠️ Олон утга нэг баганад — LIKE-ээр л хайж болно
    expect(String(zero.rows[0].book_titles)).toContain(',')

    // 1NF — атом утга
    const one = await execute(
      'postgres',
      `DROP TABLE IF EXISTS nf0;
       DROP TABLE IF EXISTS nf1;
       CREATE TABLE nf1 (
         loan_id SERIAL PRIMARY KEY,
         member_name VARCHAR(100) NOT NULL,
         book_title VARCHAR(200) NOT NULL,
         loan_date DATE NOT NULL
       );
       INSERT INTO nf1 (member_name, book_title, loan_date) VALUES
         ('Бат', 'Ном А', '2025-01-01'),
         ('Бат', 'Ном Б', '2025-01-15');
       SELECT * FROM nf1 ORDER BY loan_id;`,
    )
    expect(one.rowCount).toBe(2)
    expect(one.rows[0].book_title).toBe('Ном А')

    // Одоо цэвэр хайлт ажиллана
    const search = await execute(
      'postgres',
      "SELECT * FROM nf1 WHERE book_title = 'Ном Б'",
    )
    expect(search.rowCount).toBe(1)

    await execute('postgres', 'DROP TABLE nf1')
  }, TIMEOUT)

  it('Postgres: 2NF → 3NF давхардал арилна', async () => {
    // 2NF — гишүүн, ном, зээл тусдаа
    await execute(
      'postgres',
      `DROP TABLE IF EXISTS loans_nf2;
       DROP TABLE IF EXISTS members_nf2;
       DROP TABLE IF EXISTS books_nf2;

       CREATE TABLE members_nf2 (
         member_id SERIAL PRIMARY KEY,
         full_name VARCHAR(100) NOT NULL,
         city VARCHAR(50)
       );
       CREATE TABLE books_nf2 (
         book_id SERIAL PRIMARY KEY,
         title VARCHAR(200) NOT NULL
       );
       CREATE TABLE loans_nf2 (
         loan_id SERIAL PRIMARY KEY,
         member_id INT REFERENCES members_nf2(member_id),
         book_id INT REFERENCES books_nf2(book_id),
         loan_date DATE NOT NULL
       );

       INSERT INTO members_nf2 (full_name, city) VALUES
         ('Бат Болд', 'Улаанбаатар'), ('Сараа Ануу', 'Улаанбаатар');
       INSERT INTO books_nf2 (title) VALUES ('Ном А'), ('Ном Б');
       INSERT INTO loans_nf2 (member_id, book_id, loan_date) VALUES
         (1, 1, '2025-01-01'), (1, 2, '2025-01-15'), (2, 1, '2025-01-03');`,
    )

    // Давхардал байхгүй — 2 гишүүн, 2 ном
    const members = await execute('postgres', 'SELECT COUNT(*) AS n FROM members_nf2')
    expect(Number(members.rows[0].n)).toBe(2)

    // JOIN ажиллана
    const joined = await execute(
      'postgres',
      `SELECT m.full_name, b.title
       FROM loans_nf2 l
       JOIN members_nf2 m ON l.member_id = m.member_id
       JOIN books_nf2 b ON l.book_id = b.book_id
       ORDER BY l.loan_id`,
    )
    expect(joined.rowCount).toBe(3)

    // 3NF — хотыг тусдаа хүснэгт болгож, транзитив хамаарал арилгана
    const three = await execute(
      'postgres',
      `DROP TABLE IF EXISTS loans_nf2 CASCADE;
       DROP TABLE IF EXISTS members_nf2 CASCADE;
       DROP TABLE IF EXISTS books_nf2 CASCADE;

       CREATE TABLE cities_nf3 (
         city_id SERIAL PRIMARY KEY,
         name VARCHAR(50) NOT NULL UNIQUE,
         postal_code VARCHAR(10)
       );
       CREATE TABLE members_nf3 (
         member_id SERIAL PRIMARY KEY,
         last_name VARCHAR(50) NOT NULL,
         first_name VARCHAR(50) NOT NULL,
         city_id INT NOT NULL REFERENCES cities_nf3(city_id)
       );
       INSERT INTO cities_nf3 (name, postal_code) VALUES
         ('Улаанбаатар', '210000'), ('Дархан', '450000');
       INSERT INTO members_nf3 (last_name, first_name, city_id) VALUES
         ('Болд', 'Бат', 1), ('Ануу', 'Сараа', 1), ('Ган', 'Дорж', 2);

       -- Хотын шуудангийн код солиход ЗӨВХӨН нэг мөр шинэчлэгдэнэ
       UPDATE cities_nf3 SET postal_code = '210001' WHERE name = 'Улаанбаатар';
       SELECT m.first_name, m.last_name, c.name AS city, c.postal_code
       FROM members_nf3 m JOIN cities_nf3 c ON m.city_id = c.city_id
       ORDER BY m.member_id;`,
    )
    expect(three.rowCount).toBe(3)
    // Бүх 3 гишүүн шинэ кодыг харж байна
    for (const row of three.rows) {
      if (row.city === 'Улаанбаатар') expect(row.postal_code).toBe('210001')
    }

    await execute('postgres', 'DROP TABLE members_nf3; DROP TABLE cities_nf3;')
  }, TIMEOUT)

  it('MySQL: олон statement ажиллана', async () => {
    const r = await execute(
      'mysql',
      `DROP TABLE IF EXISTS my_multi;
       INSERT INTO books (title, author_id, category_id, price)
       VALUES ('Тест ном', 1, 1, 50000);
       SELECT COUNT(*) AS n FROM books WHERE title = 'Тест ном';`,
    )
    expect(r.rowCount).toBe(1)
    expect(Number(r.rows[0].n)).toBe(1)

    // Датаг буцаана
    await resetCurrentDomain()
  }, TIMEOUT)

  it('Reset дараа дата буцаж ирнэ', async () => {
    await execute('postgres', "DELETE FROM books WHERE book_id <= 10")
    const after = await execute('postgres', 'SELECT COUNT(*) AS n FROM books')
    expect(Number(after.rows[0].n)).toBe(110)

    await resetCurrentDomain()

    const restored = await execute('postgres', 'SELECT COUNT(*) AS n FROM books')
    expect(Number(restored.rows[0].n)).toBe(120)

    const my = await execute('mysql', 'SELECT COUNT(*) AS n FROM books')
    expect(Number(my.rows[0].n)).toBe(120)

    const mg = await execute('mongodb', 'db.books.countDocuments({})')
    expect(Number(mg.rows[0].count)).toBe(120)
  }, TIMEOUT)

  it('Бүх 5 домэйн ачаалагдана', async () => {
    for (const d of DOMAINS) {
      const snap = await loadDomain(d.id)
      expect(snap.tables.length).toBeGreaterThanOrEqual(4)

      // Postgres
      const pg = await execute('postgres', 'SELECT 1 AS ok')
      expect(Number(pg.rows[0].ok)).toBe(1)

      // MySQL
      const firstTable = snap.tables[0].name
      const my = await execute('mysql', `SELECT * FROM ${firstTable} LIMIT 1`)
      expect(my.columns.length).toBeGreaterThan(0)

      // MongoDB
      const mg = await execute('mongodb', `db.${firstTable}.find({}).limit(1)`)
      expect(mg.columns.length).toBeGreaterThan(0)
    }
  }, 300_000)
})
