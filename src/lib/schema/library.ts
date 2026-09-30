import { SeededRandom, mongolianEmail, mongolianName, mongolianPhone, isoDate } from '../seed'
import type { DomainDefinition } from './types'

/**
 * Library (Номын сан) — MBCS201 Mini Project сэдэв.
 *
 * Хамгийн энгийн, ойлгомжтой домэйн: 4 үндсэн хүснэгт + 1 lookup.
 * Week 5-10-ийн бүх сэдвийг харуулахад хангалттай:
 *   books ↔ authors ↔ categories нь JOIN, loans нь aggregate болон subquery.
 */

const DDL = `
-- Library схемийн бүтэц
CREATE TABLE categories (
  category_id  SERIAL PRIMARY KEY,
  name         VARCHAR(60) NOT NULL UNIQUE,
  description  TEXT
);

CREATE TABLE authors (
  author_id    SERIAL PRIMARY KEY,
  first_name   VARCHAR(50) NOT NULL,
  last_name    VARCHAR(50) NOT NULL,
  nationality  VARCHAR(40),
  birth_year   INT CHECK (birth_year BETWEEN 1000 AND 2020)
);

CREATE TABLE books (
  book_id      SERIAL PRIMARY KEY,
  title        VARCHAR(200) NOT NULL,
  author_id    INT NOT NULL REFERENCES authors(author_id) ON DELETE CASCADE,
  category_id  INT NOT NULL REFERENCES categories(category_id),
  isbn         VARCHAR(20) UNIQUE,
  published    INT CHECK (published BETWEEN 1000 AND 2030),
  price        NUMERIC(10,2) CHECK (price >= 0),
  copies_total INT NOT NULL DEFAULT 1 CHECK (copies_total >= 0),
  copies_available INT NOT NULL DEFAULT 1 CHECK (copies_available >= 0)
);

CREATE TABLE members (
  member_id    SERIAL PRIMARY KEY,
  first_name   VARCHAR(50) NOT NULL,
  last_name    VARCHAR(50) NOT NULL,
  email        VARCHAR(120) NOT NULL UNIQUE,
  phone        VARCHAR(20),
  city         VARCHAR(50),
  joined_on    DATE NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE loans (
  loan_id      SERIAL PRIMARY KEY,
  book_id      INT NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
  member_id    INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
  loan_date    DATE NOT NULL,
  due_date     DATE NOT NULL,
  return_date  DATE,
  fine         NUMERIC(8,2) DEFAULT 0 CHECK (fine >= 0),
  CHECK (due_date > loan_date)
);

CREATE INDEX idx_books_category ON books(category_id);
CREATE INDEX idx_loans_member ON loans(member_id);
CREATE INDEX idx_loans_returned ON loans(return_date);
`.trim()

function generateSeed(): string {
  const rng = new SeededRandom('library-v1')
  const out: string[] = []
  const q = (s: unknown) =>
    s === null || s === undefined
      ? 'NULL'
      : typeof s === 'number'
        ? String(s)
        : typeof s === 'boolean'
          ? s
            ? 'TRUE'
            : 'FALSE'
          : `'${String(s).replace(/'/g, "''")}'`

  out.push('-- Library жишээ дата (тогтвортой seed: library-v1)')

  // --- categories (8) ---
  const categories = [
    ['Уран зохиол', 'Роман, тууж, өгүүллэг'],
    ['Шинжлэх ухаан', 'Физик, хими, биологи'],
    ['Технологи', 'Компьютер, програмчлал, инженерчлэл'],
    ['Түүх', 'Монгол болон дэлхийн түүх'],
    ['Гүн ухаан', 'Философи, логик, ёс зүй'],
    ['Эдийн засаг', 'Макро, микро эдийн засаг, санхүү'],
    ['Хэл шинжлэл', 'Хэлний бүтэц, орчуулга'],
    ['Хүүхдийн ном', '6-12 насны хүүхдийн ном'],
  ]
  out.push('\n-- categories: 8 мөр')
  categories.forEach(([name, desc]) => {
    out.push(
      `INSERT INTO categories (name, description) VALUES (${q(name)}, ${q(desc)});`,
    )
  })

  // --- authors (40) ---
  const nationalities = [
    'Монгол', 'Монгол', 'Монгол', 'Орос', 'Хятад', 'Япон', 'Солонгос',
    'Англи', 'Америк', 'Франц', 'Герман', 'Энэтхэг',
  ]
  const authors: { id: number; last: string; first: string }[] = []
  out.push('\n-- authors: 40 мөр')
  for (let i = 1; i <= 40; i++) {
    const { first, last } = mongolianName(rng)
    const nat = rng.weighted([
      { value: 'Монгол', weight: 55 },
      { value: 'Орос', weight: 10 },
      { value: 'Хятад', weight: 8 },
      { value: 'Япон', weight: 7 },
      { value: 'Англи', weight: 6 },
      { value: 'Америк', weight: 5 },
      { value: 'Франц', weight: 4 },
      { value: 'Герман', weight: 3 },
      { value: 'Энэтхэг', weight: 2 },
    ])
    const birthYear = rng.int(1920, 1990)
    authors.push({ id: i, last, first })
    out.push(
      `INSERT INTO authors (first_name, last_name, nationality, birth_year) VALUES (${q(first)}, ${q(last)}, ${q(nat)}, ${birthYear});`,
    )
    void nationalities
  }

  // --- books (120) ---
  // Монгол + англи гарчиг холимог — хүүхэд LIKE, ILIKE-д туршина.
  const titlePrefixes = [
    'Нууцлаг', 'Газар дэлхийн', 'Мөнхийн', 'Алсын', 'Хөх',
    'Гэрэлт', 'Харанхуй', 'Төгсгөлгүй', 'Сүүлийн', 'Эхний',
    'Deep', 'Modern', 'Practical', 'Essential', 'Advanced',
    'Introduction to', 'Fundamentals of', 'Understanding', 'Mastering',
  ]
  const titleSubjects = [
    'Одон', 'Замын', 'Хайр', 'Тэнгэр', 'Хөндий',
    'Уул', 'Далай', 'Хот', 'Ном', 'Амьдрал',
    'Databases', 'Algorithms', 'Networks', 'Systems', 'Web Development',
    'Machine Learning', 'Security', 'Cloud Computing', 'Data Structures', 'SQL',
  ]
  const isbnPool = new Set<string>()
  out.push('\n-- books: 120 мөр')
  for (let i = 1; i <= 120; i++) {
    let title = `${rng.pick(titlePrefixes)} ${rng.pick(titleSubjects)}`
    if (rng.chance(0.25)) title += ` (${rng.int(1, 5)}-р боть)`

    let isbn = `978-${rng.int(100, 999)}-${rng.int(10000, 99999)}-${rng.int(0, 9)}`
    while (isbnPool.has(isbn)) {
      isbn = `978-${rng.int(100, 999)}-${rng.int(10000, 99999)}-${rng.int(0, 9)}`
    }
    isbnPool.add(isbn)

    const authorId = rng.int(1, 40)
    const categoryId = rng.weighted([
      { value: 1, weight: 22 },
      { value: 3, weight: 18 },
      { value: 2, weight: 14 },
      { value: 4, weight: 12 },
      { value: 8, weight: 10 },
      { value: 6, weight: 9 },
      { value: 7, weight: 8 },
      { value: 5, weight: 7 },
    ])
    const published = rng.int(1960, 2024)
    const price = Math.round(rng.float() * 88000 + 12000)
    const total = rng.weighted([
      { value: 1, weight: 30 },
      { value: 2, weight: 25 },
      { value: 3, weight: 20 },
      { value: 5, weight: 15 },
      { value: 8, weight: 10 },
    ])
    const available = rng.int(0, total)

    out.push(
      `INSERT INTO books (title, author_id, category_id, isbn, published, price, copies_total, copies_available) VALUES (${q(title)}, ${authorId}, ${categoryId}, ${q(isbn)}, ${published}, ${price}, ${total}, ${available});`,
    )
  }

  // --- members (80) ---
  out.push('\n-- members: 80 мөр')
  for (let i = 1; i <= 80; i++) {
    const { first, last } = mongolianName(rng)
    const email = mongolianEmail(rng, first, last)
    const phone = mongolianPhone(rng)
    const city = rng.weighted([
      { value: 'Улаанбаатар', weight: 50 },
      { value: 'Дархан', weight: 12 },
      { value: 'Эрдэнэт', weight: 10 },
      { value: 'Чойбалсан', weight: 8 },
      { value: 'Мөрөн', weight: 6 },
      { value: 'Ховд', weight: 5 },
      { value: 'Улаангом', weight: 4 },
      { value: 'Баянхонгор', weight: 3 },
      { value: 'Арвайхээр', weight: 2 },
    ])
    const joined = rng.dateBetween(new Date('2019-01-01'), new Date('2025-06-01'))
    const active = rng.chance(0.82)

    out.push(
      `INSERT INTO members (first_name, last_name, email, phone, city, joined_on, is_active) VALUES (${q(first)}, ${q(last)}, ${q(email)}, ${q(phone)}, ${q(city)}, ${q(isoDate(joined))}, ${q(active)});`,
    )
  }

  // --- loans (220) ---
  // 65% нь буцаагдсан, 35% нь идэвхтэй → aggregate дасгал хийхэд тохиромжтой.
  out.push('\n-- loans: 220 мөр')
  let loanCount = 0
  for (let i = 1; i <= 220; i++) {
    const bookId = rng.int(1, 120)
    const memberId = rng.int(1, 80)
    const loanDate = rng.dateBetween(new Date('2024-01-01'), new Date('2025-09-01'))
    const dueDate = new Date(loanDate)
    dueDate.setDate(dueDate.getDate() + 14)

    const returned = rng.chance(0.65)
    let returnDate: Date | null = null
    let fine = 0

    if (returned) {
      returnDate = new Date(loanDate)
      const daysKept = rng.weighted([
        { value: rng.int(1, 13), weight: 65 },
        { value: rng.int(14, 21), weight: 25 },
        { value: rng.int(22, 40), weight: 10 },
      ])
      returnDate.setDate(returnDate.getDate() + daysKept)
      if (returnDate > dueDate) {
        const overdueDays = Math.floor(
          (returnDate.getTime() - dueDate.getTime()) / 86400000,
        )
        fine = overdueDays * 500
      }
    } else if (dueDate < new Date('2025-09-30')) {
      // Идэвхтэй боловч хугацаа хэтэрсэн
      const overdueDays = Math.floor(
        (new Date('2025-09-30').getTime() - dueDate.getTime()) / 86400000,
      )
      fine = overdueDays * 500
    }

    out.push(
      `INSERT INTO loans (book_id, member_id, loan_date, due_date, return_date, fine) VALUES (${bookId}, ${memberId}, ${q(isoDate(loanDate))}, ${q(isoDate(dueDate))}, ${returnDate ? q(isoDate(returnDate)) : 'NULL'}, ${fine});`,
    )
    loanCount++
  }

  out.push(`\n-- Нийт ${8 + 40 + 120 + 80 + loanCount} мөр оруулсан`)
  return out.join('\n')
}

export const libraryDomain: DomainDefinition = {
  id: 'library',
  label: 'Номын сан',
  weeks: [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13],
  description:
    'Номын сангийн систем: ном, зохиолч, гишүүн, зээл. Реляцийн загвар болон JOIN үзэхэд хамгийн тохиромжтой.',
  ddl: DDL,
  seed: generateSeed(),
  examples: [
    // =====================================================================
    // DDL — ХҮСНЭГТИЙН БҮТЭЦ (Week 4)
    // =====================================================================
    {
      title: 'Шинэ хүснэгт үүсгэх',
      week: 4,
      category: 'ddl',
      mutates: true,
      sql: `CREATE TABLE reviews (
  review_id   SERIAL PRIMARY KEY,
  book_id     INT NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
  member_id   INT NOT NULL REFERENCES members(member_id) ON DELETE CASCADE,
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Үүссэн эсэхийг шалгана
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'reviews'
ORDER BY ordinal_position;`,
      explanation:
        'CREATE TABLE нь хүснэгтийн бүтцийг тодорхойлно. `SERIAL` нь автомат өсөх бүхэл тоо (1, 2, 3...). `REFERENCES` нь гадаад түлхүүр — зөвхөн байгаа ном/гишүүний ID оруулна. `CHECK (rating BETWEEN 1 AND 5)` нь 1-5 одны хязгаар тавина. `DEFAULT NOW()` нь огноог автоматаар тавина.',
    },
    {
      title: 'Хүснэгтэд багана нэмэх',
      week: 4,
      category: 'ddl',
      mutates: true,
      sql: `-- Шинэ багана нэмэх
ALTER TABLE books ADD COLUMN language VARCHAR(20) DEFAULT 'Монгол';

-- Одоо байгаа мөрүүд DEFAULT утга авна
SELECT title, language FROM books LIMIT 5;`,
      explanation:
        "`ALTER TABLE ... ADD COLUMN` нь хүснэгтийн бүтцийг өөрчилнө. `DEFAULT` өгснөөр одоо байгаа БҮХ мөр тэр утгыг авна. Хэрэв `NOT NULL` багана нэмэх бол DEFAULT заавал хэрэгтэй — тэгэхгүй бол байгаа мөрүүдэд ямар утга орохыг DBMS мэдэхгүй.",
    },
    {
      title: 'Баганын төрөл өөрчлөх',
      week: 4,
      category: 'ddl',
      mutates: true,
      sql: `-- Одоогийн төрлийг харна
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'members' AND column_name = 'phone';

-- Төрлийг өргөтгөнө (20 → 30 тэмдэгт)
ALTER TABLE members ALTER COLUMN phone TYPE VARCHAR(30);

-- Буцаах
ALTER TABLE members ALTER COLUMN phone TYPE VARCHAR(20);`,
      explanation:
        "`ALTER COLUMN ... TYPE` нь баганын төрлийг өөрчилнө. Хэрэв байгаа дата шинэ төрөлд багтахгүй бол (жишээ нь текст оруулсан баганыг INT болговол) DBMS алдаа өгнө — энэ нь өгөгдөл алдагдахаас сэргийлнэ.",
    },
    {
      title: 'CHECK constraint нэмэх',
      week: 4,
      category: 'ddl',
      mutates: true,
      sql: `-- Багана нэмээд, нэн даруй хязгаар тавина
ALTER TABLE books ADD COLUMN rating NUMERIC(2,1);
ALTER TABLE books ADD CONSTRAINT chk_rating CHECK (rating BETWEEN 0 AND 5);

-- Одоо буруу утга оруулахыг оролдоно (АЛДАА өгнө)
INSERT INTO books (title, author_id, category_id, rating)
VALUES ('Тест', 1, 1, 9.9);`,
      explanation:
        "`ADD CONSTRAINT` нь хязгаарыг тусдаа нэрээр (`chk_rating`) нэмнэ. Нэр өгснөөр дараа нь `DROP CONSTRAINT chk_rating` гэж устгаж болно. Хязгаар нь DBMS түвшинд ажиллана — аппликейшн код алдаа гаргасан ч буруу дата орохгүй.",
    },
    {
      title: 'Constraint устгах',
      week: 4,
      category: 'ddl',
      mutates: true,
      sql: `-- Аль constraint байгааг харна
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'books'::regclass;

-- Хязгаарыг устгана
ALTER TABLE books DROP CONSTRAINT IF EXISTS chk_rating;
ALTER TABLE books DROP COLUMN IF EXISTS rating;`,
      explanation:
        "`pg_constraint` нь системийн хүснэгт — бүх constraint-ийг хадгална. `contype` утгууд: `p` = primary key, `f` = foreign key, `u` = unique, `c` = check. `IF EXISTS` нь байхгүй ч алдаа өгөхгүй — дахин ажиллуулахад аюулгүй.",
    },
    {
      title: 'Хүснэгт устгах',
      week: 4,
      category: 'ddl',
      mutates: true,
      sql: `-- ⚠️ Энэ нь хүснэгтийг БҮРЭН устгана
DROP TABLE IF EXISTS reviews CASCADE;

-- Устсан эсэхийг батална
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'reviews';`,
      explanation:
        "`DROP TABLE` нь хүснэгтийн бүтэц БОЛОН бүх мөрийг устгана — буцаах боломжгүй. `DELETE FROM` нь зөвхөн мөр устгаад бүтцийг үлдээнэ. `IF EXISTS` нь байхгүй хүснэгтийг устгах гэхэд алдаа өгөхгүй.",
    },
    // =====================================================================
    // DML — МӨР (Week 6)
    // =====================================================================
    {
      title: 'Нэг мөр нэмэх',
      week: 6,
      category: 'dml',
      mutates: true,
      sql: `-- Шинэ гишүүн бүртгэх
INSERT INTO members (first_name, last_name, email, phone, city, joined_on)
VALUES ('Сараа', 'Болд', 'saraa.bold@example.mn', '99112233', 'Улаанбаатар', CURRENT_DATE);

-- Шинэ мөрийг харна
SELECT * FROM members WHERE email = 'saraa.bold@example.mn';`,
      explanation:
        "`INSERT INTO ... VALUES` нь нэг мөр нэмнэ. `member_id` нь `SERIAL` тул бичих шаардлагагүй — DBMS автоматаар өгнө. Багана нэрсийг тодорхой бичих нь ЧУХАЛ: тэгэхгүй бол дараалал буруу болж болно.",
    },
    {
      title: 'Олон мөр нэг дор нэмэх',
      week: 6,
      category: 'dml',
      mutates: true,
      sql: `-- Олон мөрийг нэг INSERT-ээр
INSERT INTO categories (name, description) VALUES
  ('Аялал', 'Аялал жуулчлалын ном'),
  ('Хоол', 'Хоол, жор'),
  ('Тамир', 'Спорт, дасгал');

SELECT * FROM categories ORDER BY category_id DESC LIMIT 3;`,
      explanation:
        "Олон мөр нэг `INSERT`-ээр нэмэх нь тусдаа 3 `INSERT`-ээс ХУРДАН — сүлжээний эргэлт 1 удаа л явна, transaction нэг. Postgres нь statement бүрийг implicit transaction-д багцладаг тул 3 тусдаа INSERT нь 3 transaction болно.",
    },
    {
      title: 'INSERT ... SELECT — өөр хүснэгтээс',
      week: 6,
      category: 'dml',
      mutates: true,
      sql: `-- Архивын хүснэгт үүсгээд, хуучин мөрүүдийг хуулна
CREATE TABLE archived_loans (
  loan_id    INT,
  book_id    INT,
  member_id  INT,
  loan_date  DATE,
  returned   DATE,
  archived_at TIMESTAMP DEFAULT NOW()
);

-- 2024 онд буцаагдсан зээлүүдийг архив руу
INSERT INTO archived_loans (loan_id, book_id, member_id, loan_date, returned)
SELECT loan_id, book_id, member_id, loan_date, return_date
FROM loans
WHERE return_date IS NOT NULL
  AND loan_date < '2025-01-01';

SELECT COUNT(*) AS archived FROM archived_loans;`,
      explanation:
        "`INSERT INTO ... SELECT` нь query-гийн үр дүнг шууд өөр хүснэгтэд оруулна. Энэ нь өгөгдөл шилжүүлэх, архив үүсгэх, нөөцлөхөд хэрэглэгддэг хамгийн түгээмэл арга. `WHERE` нөхцөл нь ямар мөр хуулагдахыг шийднэ.",
    },
    {
      title: 'Мөр шинэчлэх (UPDATE)',
      week: 6,
      category: 'dml',
      mutates: true,
      sql: `-- ⚠️ WHERE-гүй UPDATE нь БҮХ мөрийг өөрчилнө!
UPDATE members SET is_active = FALSE WHERE member_id = 1;

-- Баталгаажуулна
SELECT member_id, first_name, is_active FROM members WHERE member_id = 1;

-- Буцаана
UPDATE members SET is_active = TRUE WHERE member_id = 1;`,
      explanation:
        "`UPDATE` нь `WHERE`-д тохирох мөрүүдийг өөрчилнө. **WHERE бичихээ мартвал БҮХ мөр өөрчлөгдөнө** — энэ бол хамгийн түгээмэл ноцтой алдаа. Ажиллуулахаасаа өмнө `SELECT * FROM ... WHERE ...` гэж шалгаж үзээрэй.",
    },
    {
      title: 'Олон мөрийг нэг UPDATE-ээр',
      week: 6,
      category: 'dml',
      mutates: true,
      sql: `-- Ангилалаас хамаарч үнийг өөрчилнө
UPDATE books
SET price = CASE
  WHEN category_id = 3 THEN ROUND(price * 1.10, 2)  -- Технологи +10%
  WHEN category_id = 8 THEN ROUND(price * 0.90, 2)  -- Хүүхдийн -10%
  ELSE price
END
WHERE category_id IN (3, 8);

SELECT category_id, COUNT(*) AS n, ROUND(AVG(price), 0) AS avg_price
FROM books WHERE category_id IN (3, 8)
GROUP BY category_id;`,
      explanation:
        "`CASE ... WHEN ... THEN ... END` нь нөхцөлт утга өгнө — өөр өөр мөрд өөр өөр өөрчлөлт хийхэд. Энэ нь `IF/ELSE`-ийн SQL хувилбар. `WHERE category_id IN (3, 8)` нь зөвхөн хоёр ангилалд л хүрнэ.",
    },
    {
      title: 'UPDATE ... FROM — өөр хүснэгтээс',
      week: 6,
      category: 'dml',
      mutates: true,
      sql: `-- Хүснэгт үүсгэж, дараа нь өөр хүснэгтийн утгаар шинэчилнэ
CREATE TABLE book_stats (
  book_id   INT PRIMARY KEY,
  loan_count INT DEFAULT 0
);

INSERT INTO book_stats (book_id)
SELECT book_id FROM books;

-- loans-оос тооцоолж шинэчилнэ
UPDATE book_stats bs
SET loan_count = sub.n
FROM (
  SELECT book_id, COUNT(*) AS n FROM loans GROUP BY book_id
) AS sub
WHERE bs.book_id = sub.book_id;

SELECT * FROM book_stats WHERE loan_count > 0 ORDER BY loan_count DESC LIMIT 5;`,
      explanation:
        "`UPDATE ... FROM` нь Postgres-ийн өргөтгөл — өөр хүснэгтийн өгөгдлөөр мөр шинэчилнэ. Энэ нь денормализаци хийсэн утгыг (жишээ нь `loan_count`) дахин тооцоолоход хэрэглэгддэг. MySQL-д `UPDATE ... JOIN` гэж бичнэ.",
    },
    {
      title: 'Мөр устгах (DELETE)',
      week: 6,
      category: 'dml',
      mutates: true,
      sql: `-- ⚠️ WHERE-гүй DELETE нь БҮХ мөрийг устгана!
-- Эхлээд хэдэн мөр устахыг харна
SELECT COUNT(*) AS will_delete FROM members WHERE is_active = FALSE;

-- Дараа нь устгана
DELETE FROM members WHERE is_active = FALSE;

-- Баталгаажуулна
SELECT COUNT(*) AS remaining FROM members;`,
      explanation:
        "`DELETE` нь `WHERE`-д тохирох мөрүүдийг устгана. **Ажиллуулахаасаа өмнө `SELECT COUNT(*)` гэж шалгах** нь дадал болгох ёстой. `DELETE FROM members` (WHERE-гүй) нь бүх гишүүнийг устгана — гэхдээ 'Дата сэргээх' товчоор буцаана.",
    },
    {
      title: 'Холбоотой мөр автоматаар устах (CASCADE)',
      week: 6,
      category: 'dml',
      mutates: true,
      sql: `-- Эхлээд нэг номны зээлийн тоог харна
SELECT COUNT(*) AS loans_before FROM loans WHERE book_id = 5;

-- Номыг устгана
DELETE FROM books WHERE book_id = 5;

-- Зээлүүд ч автоматаар устсан уу?
SELECT COUNT(*) AS loans_after FROM loans WHERE book_id = 5;`,
      explanation:
        "`loans` хүснэгт нь `REFERENCES books(book_id) ON DELETE CASCADE` гэж тодорхойлогдсон. Энэ нь: ном устгахад түүний БҮХ зээл автоматаар устана. `ON DELETE RESTRICT` (default) байсан бол DBMS алдаа өгч, устгахыг хориглоно — ингэснээр 'өнчин' мөр үүсэхээс сэргийлнэ.",
    },
    {
      title: 'Мөр нэгтгэх (UPSERT)',
      week: 6,
      category: 'dml',
      mutates: true,
      sql: `-- Багана нэмээд UNIQUE хязгаар тавина
ALTER TABLE books ADD COLUMN isbn13 VARCHAR(20) UNIQUE;

-- Эхний удаа — мөр нэмэгдэнэ
INSERT INTO books (title, author_id, category_id, isbn13)
VALUES ('Шинэ ном', 1, 1, '978-9999-0001')
ON CONFLICT (isbn13) DO NOTHING;

-- Хоёр дахь удаа — мөр давхцахгүй (алгасна)
INSERT INTO books (title, author_id, category_id, isbn13)
VALUES ('Өөр нэр', 2, 2, '978-9999-0001')
ON CONFLICT (isbn13) DO NOTHING;

SELECT title, isbn13 FROM books WHERE isbn13 = '978-9999-0001';`,
      explanation:
        "`ON CONFLICT ... DO NOTHING` нь UNIQUE хязгаар зөрчигдвөл алдаа өгөхгүй, мөрийг алгасна. `DO UPDATE SET ...` гэж бичвэл байгаа мөрийг шинэчилнэ (жинхэнэ UPSERT). Энэ нь давхардсан дата оруулахаас сэргийлдэг — импорт, sync-д маш хэрэгтэй.",
    },
    // =====================================================================
    // АСУУЛГА (Week 5-10)
    // =====================================================================
    {
      title: 'Бүх номыг үнээр эрэмбэлэх',
      week: 5,
      category: 'query',
      sql: `SELECT title, published, price
FROM books
WHERE price > 30000
ORDER BY price DESC
LIMIT 10;`,
      mongo: `db.books.find(
  { price: { $gt: 30000 } },
  { title: 1, published: 1, price: 1 }
).sort({ price: -1 }).limit(10)`,
      explanation:
        'WHERE нь мөр шүүнэ, ORDER BY нь эрэмбэлнэ, LIMIT нь тоог хязгаарлана. Гүйцэтгэлийн дараалал: FROM → WHERE → SELECT → ORDER BY → LIMIT.',
    },
    {
      title: 'Нийт номын тоо, дундаж үнэ',
      week: 7,
      category: 'query',
      sql: `SELECT COUNT(*) AS total_books,
       ROUND(AVG(price), 2) AS avg_price,
       MIN(price) AS cheapest,
       MAX(price) AS most_expensive
FROM books;`,
      mongo: `db.books.aggregate([
  { $group: {
      _id: null,
      total_books: { $sum: 1 },
      avg_price: { $avg: "$price" },
      cheapest: { $min: "$price" },
      most_expensive: { $max: "$price" }
  }}
])`,
      explanation:
        'Aggregate функцууд нь олон мөрийг НЭГ мөр болгож нэгтгэнэ. COUNT(*) нь мөрийн тоо, AVG нь дундаж. MongoDB-д энэ нь $group stage-аар хийгдэнэ.',
    },
    {
      title: 'Ангилал тус бүрийн номын тоо',
      week: 7,
      category: 'query',
      sql: `SELECT c.name AS category, COUNT(*) AS book_count
FROM books b
JOIN categories c ON b.category_id = c.category_id
GROUP BY c.name
HAVING COUNT(*) > 10
ORDER BY book_count DESC;`,
      mongo: `db.books.aggregate([
  { $lookup: {
      from: "categories", localField: "category_id",
      foreignField: "category_id", as: "cat"
  }},
  { $unwind: "$cat" },
  { $group: { _id: "$cat.name", book_count: { $sum: 1 } } },
  { $match: { book_count: { $gt: 10 } } },
  { $sort: { book_count: -1 } }
])`,
      explanation:
        'GROUP BY нь ангилал тус бүрээр бүлэглэнэ. WHERE нь бүлэглэхээс ӨМНӨ шүүнэ, HAVING нь бүлэглэсний ДАРАА шүүнэ — энэ ялгаа маш чухал. MongoDB-д $lookup нь JOIN, $match нь HAVING.',
    },
    {
      title: 'Зээлдэгдэж байгаа номууд (JOIN)',
      week: 9,
      category: 'query',
      sql: `SELECT b.title, m.first_name, m.last_name,
       l.loan_date, l.due_date
FROM loans l
INNER JOIN books b ON l.book_id = b.book_id
INNER JOIN members m ON l.member_id = m.member_id
WHERE l.return_date IS NULL
ORDER BY l.due_date;`,
      mongo: `db.loans.aggregate([
  { $match: { return_date: null } },
  { $lookup: { from: "books", localField: "book_id",
               foreignField: "book_id", as: "book" }},
  { $unwind: "$book" },
  { $sort: { due_date: 1 } }
])`,
      explanation:
        'INNER JOIN нь хоёр хүснэгтэд хоёуланд нь тохирох мөрийг л авна. `return_date IS NULL` нь буцаагаагүй гэсэн үг. NULL-ийг `= NULL` гэж бичих НЬ БУРУУ — зөвхөн `IS NULL` ажиллана.',
    },
    {
      title: 'Хэзээ ч зээлээгүй гишүүд (LEFT JOIN + NULL)',
      week: 9,
      category: 'query',
      sql: `SELECT m.member_id, m.first_name, m.last_name, m.email
FROM members m
LEFT JOIN loans l ON m.member_id = l.member_id
WHERE l.loan_id IS NULL
ORDER BY m.last_name;`,
      mongo: `db.members.aggregate([
  { $lookup: { from: "loans", localField: "member_id",
               foreignField: "member_id", as: "loans" }},
  { $match: { loans: { $size: 0 } } }
])`,
      explanation:
        'LEFT JOIN нь зүүн талын БҮХ мөрийг үлдээж, баруун талд тохирохгүй бол NULL хийнэ. Дараа нь `IS NULL` шүүлтээр "тохироогүй" мөрүүдийг олно. Энэ бол anti-join гэсэн классик техник.',
    },
    {
      title: 'Дунджаас үнэтэй номууд (subquery)',
      week: 10,
      category: 'query',
      sql: `SELECT title, price
FROM books
WHERE price > (SELECT AVG(price) FROM books)
ORDER BY price DESC;`,
      mongo: `// MongoDB-д subquery-г хоёр шатаар хийнэ
const avg = db.books.aggregate([
  { $group: { _id: null, v: { $avg: "$price" } } }
]).toArray()[0].v
db.books.find({ price: { $gt: avg } }).sort({ price: -1 })`,
      explanation:
        'Хаалт доторх subquery эхлээд ажиллаж нэг утга буцаана, дараа нь гадаад query түүнтэй харьцуулна. Энэ төрлийг "scalar subquery" гэж нэрлэнэ.',
    },
    {
      title: '3-аас олон зээл авсан гишүүд (GROUP BY + HAVING + JOIN)',
      week: 10,
      category: 'query',
      sql: `SELECT m.first_name, m.last_name, COUNT(*) AS loan_count
FROM members m
JOIN loans l ON m.member_id = l.member_id
GROUP BY m.member_id, m.first_name, m.last_name
HAVING COUNT(*) > 3
ORDER BY loan_count DESC;`,
      explanation:
        'GROUP BY-д `m.member_id`-г оруулах ёстой — тэгэхгүй бол ижил нэртэй хоёр гишүүн нэг мөр болж нийлнэ. Энэ бол бодит алдаа гардаг газар.',
    },
    {
      title: 'EXISTS — дор хаяж нэг удаа зээлсэн ном',
      week: 10,
      category: 'query',
      sql: `SELECT b.book_id, b.title
FROM books b
WHERE EXISTS (
  SELECT 1 FROM loans l WHERE l.book_id = b.book_id
)
ORDER BY b.title
LIMIT 15;`,
      mongo: `db.books.aggregate([
  { $lookup: { from: "loans", localField: "book_id",
               foreignField: "book_id", as: "loans" }},
  { $match: { "loans.0": { $exists: true } } },
  { $limit: 15 }
])`,
      explanation:
        'EXISTS нь "дор хаяж нэг мөр байна уу?" гэсэн асуултад хариулна. IN-ээс илүү хурдан байж болно, учир нь эхний тохирол олдмолцоо зогсоно. Correlated subquery гэдэг нь гадаад query-гийн утгыг ашиглаж байгаа хэсэг.',
    },
    {
      title: 'Хамгийн олон зээлэгдсэн 5 ном',
      week: 10,
      category: 'query',
      sql: `SELECT b.title, COUNT(*) AS times_borrowed
FROM books b
JOIN loans l ON b.book_id = l.book_id
GROUP BY b.book_id, b.title
ORDER BY times_borrowed DESC
LIMIT 5;`,
      explanation:
        'GROUP BY + COUNT + ORDER BY + LIMIT — "топ N" асуултын стандарт хэв маяг. Энэ нь маш олон бодит системд хэрэглэгддэг.',
    },
    {
      title: 'Ангилал тус бүрийн нийт зээлийн орлого',
      week: 7,
      category: 'query',
      sql: `SELECT c.name AS category,
       COUNT(l.loan_id) AS loans,
       COALESCE(SUM(l.fine), 0) AS total_fines
FROM categories c
LEFT JOIN books b ON c.category_id = b.category_id
LEFT JOIN loans l ON b.book_id = l.book_id
GROUP BY c.category_id, c.name
ORDER BY total_fines DESC;`,
      explanation:
        'COALESCE(x, 0) нь NULL-ийг 0 болгоно — зээл байхгүй ангилалд SUM нь NULL буцаадаг тул зайлшгүй. LEFT JOIN-ийг гинжлэхэд завсрын хүснэгт бүрт анхаарах хэрэгтэй.',
    },
    {
      title: 'VIEW үүсгэх — идэвхтэй зээлүүд',
      week: 12,
      category: 'view-index',
      mutates: true,
      sql: `CREATE VIEW active_loans AS
SELECT l.loan_id, b.title, m.first_name || ' ' || m.last_name AS member_name,
       l.due_date,
       (CURRENT_DATE - l.due_date) AS days_overdue
FROM loans l
JOIN books b ON l.book_id = b.book_id
JOIN members m ON l.member_id = m.member_id
WHERE l.return_date IS NULL;

-- Дараа нь view-г энгийн хүснэгт шиг ашиглана:
SELECT * FROM active_loans WHERE days_overdue > 0 ORDER BY days_overdue DESC;`,
      explanation:
        'VIEW нь хадгалагдсан query — өгөгдөл хадгалдаггүй. `||` нь Postgres-д string холбоно (MySQL-д CONCAT ашиглана).',
    },
    {
      title: 'Index-ийн нөлөөлөл харах',
      week: 12,
      category: 'view-index',
      sql: `-- Index-тэй хайлт
EXPLAIN ANALYZE
SELECT * FROM books WHERE category_id = 3;`,
      explanation:
        'EXPLAIN ANALYZE нь query-г бодитоор ажиллуулж, ямар төлөвлөгөө ашигласныг харуулна. `Index Scan` харвал index ажиллаж байна, `Seq Scan` харвал бүтэн хүснэгт уншиж байна.',
    },
    {
      title: 'Transaction — ном зээлэх (atomic)',
      week: 13,
      category: 'transaction',
      mutates: true,
      sql: `BEGIN;

UPDATE books SET copies_available = copies_available - 1
WHERE book_id = 5 AND copies_available > 0;

INSERT INTO loans (book_id, member_id, loan_date, due_date)
VALUES (5, 12, CURRENT_DATE, CURRENT_DATE + 14);

COMMIT;

-- Хэрэв алдаа гарвал огт өөрчлөлт орохгүй байх ёстой бол:
-- ROLLBACK;`,
      explanation:
        'Transaction нь олон үйлдлийг НЭГ болгож бүлэглэнэ: бүгд амжилттай, эсвэл бүгд цуцлагдана (ACID-ийн Atomicity). `copies_available > 0` нөхцөл нь хоёр хүн нэг номыг зэрэг авахаас сэргийлнэ.',
    },
    {
      title: 'CHECK constraint турших — буруу утга',
      week: 4,
      category: 'ddl',
      mutates: true,
      sql: `-- Энэ query АЛДАА өгнө — учир нь due_date > loan_date байх ёстой
INSERT INTO loans (book_id, member_id, loan_date, due_date)
VALUES (1, 1, '2025-06-01', '2025-05-01');`,
      explanation:
        'CHECK constraint нь өгөгдлийн бүрэн бүтэн байдлыг DBMS түвшинд баталгаажуулна. Аппликейшн код алдаа гаргасан ч буруу дата орохгүй.',
    },
    {
      title: 'Гишүүн бүрийн сүүлийн зээлийн огноо',
      week: 10,
      category: 'query',
      sql: `SELECT m.first_name, m.last_name,
       (SELECT MAX(l.loan_date) FROM loans l WHERE l.member_id = m.member_id) AS last_loan
FROM members m
ORDER BY last_loan DESC NULLS LAST
LIMIT 10;`,
      explanation:
        'Correlated subquery — дотоод query нь гадаад query-гийн `m.member_id`-г ашиглаж байна. `NULLS LAST` нь NULL утгуудыг хамгийн сүүлд тавина (Postgres-ийн онцлог).',
    },
    // =====================================================================
    // НОРМАЛЧЛАЛ — 1NF → 2NF → 3NF (Week 11)
    // =====================================================================
    {
      title: '0. Нормалчлаагүй хүснэгт (асуудалтай)',
      week: 11,
      category: 'normalization',
      step: 'before',
      mutates: true,
      sql: `-- ⚠️ ЗОРИУД буруу хүснэгт — нормалчлалын өмнөх байдал
CREATE TABLE loans_unnormalized (
  loan_id     SERIAL PRIMARY KEY,
  member_name VARCHAR(100),      -- "Болд Сараа" бүтэн нэр нэг баганад
  member_phone VARCHAR(20),
  member_city  VARCHAR(50),      -- Гишүүн бүрд давтагдана!
  book_titles  TEXT,             -- "Ном А, Ном Б, Ном В" — олон утга нэг баганад
  loan_dates   TEXT,             -- "2025-01-01, 2025-01-15" — олон огноо нэг баганад
  librarian    VARCHAR(50),
  librarian_phone VARCHAR(20)    -- Номын санч бүрд давтагдана
);

INSERT INTO loans_unnormalized
  (member_name, member_phone, member_city, book_titles, loan_dates, librarian, librarian_phone)
VALUES
  ('Болд Сараа', '99112233', 'Улаанбаатар', 'Одон Замын, Тэнгэрийн Хөндий', '2025-01-01, 2025-01-15', 'Дорж', '88001122'),
  ('Мөнх Ануу',  '99223344', 'Улаанбаатар', 'Одон Замын',                  '2025-01-03',              'Дорж', '88001122'),
  ('Ган Тэмүүлэн','99334455','Дархан',      'Далайн Дуу, Уулын Орой',     '2025-01-05, 2025-01-20', 'Сүх',  '88003344');

SELECT * FROM loans_unnormalized;`,
      explanation:
        '⚠️ Энэ хүснэгт ДӨРӨВ асуудалтай:\n\n**1. Атом бус утга** — `book_titles` ба `loan_dates` баганад олон утга нэг талбайд байна. "Одон Замын" гэсэн номыг хайхын тулд `LIKE \'%Одон Замын%\'` гэж бичих шаардлагатай — index ажиллахгүй, буруу мөр олдож болно.\n\n**2. Давхардал** — "Улаанбаатар" 2 удаа, "Дорж" + "88001122" 2 удаа хадгалагдсан. 80 гишүүн ижил хотод байвал 80 удаа бичнэ.\n\n**3. Шинэчлэлийн anomaly** — Доржийн утас солигдвол 2 мөр шинэчлэх ёстой. Нэгийг мартаж бичвэл дата зөрж эхэлнэ.\n\n**4. Устгалын anomaly** — Сүх гэсэн санчийг устгавал түүний цорын ганц зээлийн бүртгэл ч устана.\n\nДараагийн 3 жишээ үүнийг үе шаттайгаар засна.',
    },
    {
      title: '1NF — Атом утга (эхний алхам)',
      week: 11,
      category: 'normalization',
      step: '1nf',
      mutates: true,
      sql: `-- ═══ 1NF: бүх утга АТОМ байх ёстой ═══
-- Нэг нүдэнд нэг утга. Давхардсан бүлэг багана байхгүй.
-- PRIMARY KEY байх ёстой.

DROP TABLE IF EXISTS loans_1nf CASCADE;
CREATE TABLE loans_1nf (
  loan_id      SERIAL PRIMARY KEY,
  member_name  VARCHAR(100) NOT NULL,
  member_phone VARCHAR(20),
  member_city  VARCHAR(50),
  book_title   VARCHAR(200) NOT NULL,   -- ✅ Нэг ном
  loan_date    DATE NOT NULL,           -- ✅ Нэг огноо
  librarian    VARCHAR(50),
  librarian_phone VARCHAR(20)
);

INSERT INTO loans_1nf
  (member_name, member_phone, member_city, book_title, loan_date, librarian, librarian_phone)
VALUES
  ('Болд Сараа',   '99112233', 'Улаанбаатар', 'Одон Замын',        '2025-01-01', 'Дорж', '88001122'),
  ('Болд Сараа',   '99112233', 'Улаанбаатар', 'Тэнгэрийн Хөндий',  '2025-01-15', 'Дорж', '88001122'),
  ('Мөнх Ануу',    '99223344', 'Улаанбаатар', 'Одон Замын',        '2025-01-03', 'Дорж', '88001122'),
  ('Ган Тэмүүлэн', '99334455', 'Дархан',      'Далайн Дуу',        '2025-01-05', 'Сүх',  '88003344'),
  ('Ган Тэмүүлэн', '99334455', 'Дархан',      'Уулын Орой',        '2025-01-20', 'Сүх',  '88003344');

SELECT * FROM loans_1nf ORDER BY loan_id;`,
      explanation:
        '**1NF-ийн 3 шаардлага:**\n\n1. Бүх утга **атом** (atomic) — нэг нүдэнд нэг утга. `"Одон Замын, Тэнгэрийн Хөндий"` гэдгийг 2 мөр болголоо.\n\n2. **Давхардсан бүлэг** багана байхгүй — `book1`, `book2`, `book3` гэх мэт багана байх ёсгүй (хязгаарлагдмал, хэцүү өргөтгөгддөг).\n\n3. **PRIMARY KEY** байх ёстой — `loan_id`.\n\n⚠️ Гэхдээ 1NF нь ЗӨВХӨН эхний алхам. Одоо "Болд Сараа" + "99112233" + "Улаанбаатар" 2 удаа, "Дорж" + "88001122" 3 удаа давтагдаж байна. `book_title`-д гишүүний мэдээлэл хамааралгүй — дараагийн алхам 2NF.',
    },
    {
      title: '2NF — Давхардлыг арилгах (member, book, librarian)',
      week: 11,
      category: 'normalization',
      step: '2nf',
      mutates: true,
      sql: `-- ═══ 2NF: давхардсан бүлгийг тусдаа хүснэгт болгох ═══
-- Гишүүн, ном, санчийг өөр өөрийн хүснэгтэд гаргана.

DROP TABLE IF EXISTS loans_2nf CASCADE;
DROP TABLE IF EXISTS members_2nf CASCADE;
DROP TABLE IF EXISTS books_2nf CASCADE;
DROP TABLE IF EXISTS librarians_2nf CASCADE;

CREATE TABLE members_2nf (
  member_id    SERIAL PRIMARY KEY,
  full_name    VARCHAR(100) NOT NULL,   -- ⚠️ 3NF-д задална
  phone        VARCHAR(20),
  city         VARCHAR(50)
);

CREATE TABLE books_2nf (
  book_id   SERIAL PRIMARY KEY,
  title     VARCHAR(200) NOT NULL
);

CREATE TABLE librarians_2nf (
  librarian_id SERIAL PRIMARY KEY,
  name         VARCHAR(50) NOT NULL,
  phone        VARCHAR(20)
);

-- Зээл нь зөвхөн ID-уудыг хадгална + өөрийн шинж чанар
CREATE TABLE loans_2nf (
  loan_id      SERIAL PRIMARY KEY,
  member_id    INT NOT NULL REFERENCES members_2nf(member_id),
  book_id      INT NOT NULL REFERENCES books_2nf(book_id),
  librarian_id INT NOT NULL REFERENCES librarians_2nf(librarian_id),
  loan_date    DATE NOT NULL
);

INSERT INTO members_2nf (full_name, phone, city) VALUES
  ('Болд Сараа', '99112233', 'Улаанбаатар'),
  ('Мөнх Ануу',  '99223344', 'Улаанбаатар'),
  ('Ган Тэмүүлэн','99334455','Дархан');

INSERT INTO books_2nf (title) VALUES
  ('Одон Замын'), ('Тэнгэрийн Хөндий'), ('Далайн Дуу'), ('Уулын Орой');

INSERT INTO librarians_2nf (name, phone) VALUES
  ('Дорж', '88001122'), ('Сүх', '88003344');

INSERT INTO loans_2nf (member_id, book_id, librarian_id, loan_date) VALUES
  (1, 1, 1, '2025-01-01'),
  (1, 2, 1, '2025-01-15'),
  (2, 1, 1, '2025-01-03'),
  (3, 3, 2, '2025-01-05'),
  (3, 4, 2, '2025-01-20');

SELECT l.loan_id, m.full_name, b.title, lib.name AS librarian, l.loan_date
FROM loans_2nf l
JOIN members_2nf m   ON l.member_id    = m.member_id
JOIN books_2nf b     ON l.book_id      = b.book_id
JOIN librarians_2nf lib ON l.librarian_id = lib.librarian_id
ORDER BY l.loan_id;`,
      explanation:
        '**2NF-ийн шаардлага:** 1NF байх + PRIMARY KEY бус бүх багана нь түлхүүрийн БҮТЭН дээр хамаарах (хэсэгчилсэн хамаарал байхгүй).\n\nБид давхардлыг тусдаа хүснэгт болголоо:\n- `members_2nf` — гишүүн 3 мөр (өмнө 5 мөрт 3 удаа давтагдаж байсан)\n- `books_2nf` — ном 4 мөр\n- `librarians_2nf` — санчий 2 мөр (өмнө 3 удаа давтагдаж байсан)\n- `loans_2nf` — зөвхөн ID-ууд холбоно\n\n**Хожлын тооцоо:** "Улаанбаатар" гэдэг текст 5 → 2 болж, "Дорж"+"88001122" 3 → 1 боллоо. 10,000 зээлд энэ ялгаа асар их.\n\n⚠️ Гэхдээ `full_name` нь "Болд Сараа" — овог, нэр холилдсон. `city` нь шуудангийн кодыг тодорхойлдог бол дахин задрах шаардлагатай. Энэ бол 3NF.',
    },
    {
      title: '3NF — Дам хамаарлыг арилгах',
      week: 11,
      category: 'normalization',
      step: '3nf',
      mutates: true,
      sql: `-- ═══ 3NF: түлхүүрээс ГАДУУР хамаарал арилгах ═══
-- Асуудал: city → city_postal_code
--   (хот нь шуудангийн кодоо тодорхойлно)
--   Энэ нь ТРАНЗИТИВ (дам) хамаарал: member_id → city → postal_code

DROP TABLE IF EXISTS loans_2nf CASCADE;
DROP TABLE IF EXISTS members_2nf CASCADE;
DROP TABLE IF EXISTS books_2nf CASCADE;
DROP TABLE IF EXISTS librarians_2nf CASCADE;
DROP TABLE IF EXISTS members_3nf CASCADE;
DROP TABLE IF EXISTS cities_3nf CASCADE;

-- Хотыг тусдаа хүснэгт болгоно
CREATE TABLE cities_3nf (
  city_id     SERIAL PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE,
  postal_code VARCHAR(10),
  aimag       VARCHAR(50)
);

CREATE TABLE members_3nf (
  member_id  SERIAL PRIMARY KEY,
  last_name  VARCHAR(50) NOT NULL,   -- Овог
  first_name VARCHAR(50) NOT NULL,   -- Нэр
  phone      VARCHAR(20),
  city_id    INT NOT NULL REFERENCES cities_3nf(city_id)  -- ✅ Зөвхөн ID
);

INSERT INTO cities_3nf (name, postal_code, aimag) VALUES
  ('Улаанбаатар', '210000', 'Улаанбаатар'),
  ('Дархан',      '450000', 'Дархан-Уул');

INSERT INTO members_3nf (last_name, first_name, phone, city_id) VALUES
  ('Болд', 'Сараа',    '99112233', 1),
  ('Мөнх', 'Ануу',     '99223344', 1),
  ('Ган',  'Тэмүүлэн', '99334455', 2);

-- Одоо хот шинэчлэхэд НЭГ л мөр өөрчилнө
UPDATE cities_3nf SET postal_code = '210001' WHERE name = 'Улаанбаатар';

-- Гишүүдийн бүрэн мэдээлэл (JOIN-оор)
SELECT m.member_id, m.last_name, m.first_name, m.phone,
       c.name AS city, c.postal_code, c.aimag
FROM members_3nf m
JOIN cities_3nf c ON m.city_id = c.city_id
ORDER BY m.member_id;`,
      explanation:
        '**3NF-ийн шаардлага:** 2NF байх + ямар ч багана нь түлхүүр бус баганаас хамаарахгүй (транзитив хамаарал байхгүй).\n\n**Асуудал нь:** `member_id → city → postal_code`. Шуудангийн код нь ГИШҮҮНЭЭС биш, ХОТООС хамаарна. Энэ нь дам (транзитив) хамаарал.\n\n**2NF-д байсан асуудал:** Улаанбаатарын шуудангийн код солигдвол 50,000 гишүүний бүх мөрийг шинэчлэх ёстой. Нэгийг мартаж бичвэл 49,999 нь хуучин кодтой, 1 нь шинэ кодтой — дата зөрнө.\n\n**3NF-д:** `cities_3nf`-д НЭГ мөр шинэчилнэ. Бүх гишүүн автоматаар шинэ кодыг харна (JOIN-оор).\n\n**Мөн овог/нэрийг задалсан** — `full_name` → `last_name` + `first_name`. Ингэснээр овгоор хайх, эрэмбэлэх боломжтой болно.\n\n✅ Одоо схем нь 3NF-д байна: давхардал байхгүй, шинэчлэл/устгалын anomaly байхгүй.',
    },
    {
      title: 'Normalization — үр дүнгийн харьцуулалт',
      week: 11,
      category: 'normalization',
      mutates: true,
      sql: `-- ═══ 3NF схем дээр асуулга — JOIN-оор буцаана ═══
DROP TABLE IF EXISTS loans_final CASCADE;
DROP TABLE IF EXISTS books_final CASCADE;
DROP TABLE IF EXISTS librarians_final CASCADE;

CREATE TABLE books_final (
  book_id SERIAL PRIMARY KEY,
  title   VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL   -- ⚠️ 3NF биш! category → category_desc
);

CREATE TABLE librarians_final (
  librarian_id SERIAL PRIMARY KEY,
  name         VARCHAR(50) NOT NULL,
  phone        VARCHAR(20)
);

CREATE TABLE loans_final (
  loan_id      SERIAL PRIMARY KEY,
  member_id    INT NOT NULL REFERENCES members_3nf(member_id),
  book_id      INT NOT NULL REFERENCES books_final(book_id),
  librarian_id INT NOT NULL REFERENCES librarians_final(librarian_id),
  loan_date    DATE NOT NULL
);

INSERT INTO books_final (title, category) VALUES
  ('Одон Замын', 'Уран зохиол'),
  ('Тэнгэрийн Хөндий', 'Уран зохиол'),
  ('Далайн Дуу', 'Технологи'),
  ('Уулын Орой', 'Түүх');

INSERT INTO librarians_final (name, phone) VALUES
  ('Дорж', '88001122'), ('Сүх', '88003344');

INSERT INTO loans_final (member_id, book_id, librarian_id, loan_date) VALUES
  (1, 1, 1, '2025-01-01'),
  (1, 2, 1, '2025-01-15'),
  (2, 1, 1, '2025-01-03'),
  (3, 3, 2, '2025-01-05'),
  (3, 4, 2, '2025-01-20');

-- Ангилал тус бүрийн зээлийн тоо
SELECT b.category, COUNT(*) AS loans, COUNT(DISTINCT l.member_id) AS members
FROM loans_final l
JOIN books_final b ON l.book_id = b.book_id
GROUP BY b.category
ORDER BY loans DESC;`,
      explanation:
        'Нормалчлалын үр дүн:\n\n| | 0NF | 1NF | 2NF | 3NF |\n|---|---|---|---|---|\n| Гишүүн "Улаанбаатар" | 3 давтах | 5 давтах | 3 давтах | 2 давтах |\n| Санчий "Дорж" | 3 давтах | 3 давтах | 1 мөр | 1 мөр |\n| Олон утга нэг нүдэнд | ❌ тийм | ✅ үгүй | ✅ үгүй | ✅ үгүй |\n| Хот шинэчлэх | 5 мөр | 5 мөр | 3 мөр | **1 мөр** |\n| Хүснэгт | 1 | 1 | 4 | 5+ |\n\n⚠️ **Анхаар:** Хүснэгтийн тоо 1 → 5 болж өссөн. Нормалчлал нь ҮРГЭЛЖ илүү хүснэгт шаардана — энэ бол ҮНЭ. Гэхдээ давхардал, anomaly-гүй болсноор таны авдаг ашиг түүнээс их.\n\n**Денормализаци** (буцаж нэгтгэх) нь зөвхөн хурдны шалтгаанаар, санаатайгаар хийгддэг — жишээ нь тайлангийн хүснэгт. Гэхдээ эхлээд 3NF-д хүрэх ёстой.',
    },
  ],
  challenges: [
    {
      id: 'lib-1',
      title: 'Үнэтэй номууд',
      task: '50,000₮-өөс дээш үнэтэй бүх номыг гарга. Баганууд: title, price. Үнээр буурах дарааллаар.',
      expectedColumns: ['title', 'price'],
      hint: 'WHERE price > 50000 ... ORDER BY price DESC',
      solution: 'SELECT title, price FROM books WHERE price > 50000 ORDER BY price DESC;',
    },
    {
      id: 'lib-2',
      title: 'Хотын гишүүдийн тоо',
      task: 'Гишүүн бүрийг хотоор нь бүлэглэж, хот тус бүрийн гишүүдийн тоог гарга. Багана: city, member_count. Тоогоор буурах дарааллаар.',
      expectedColumns: ['city', 'member_count'],
      hint: 'GROUP BY city, COUNT(*) AS member_count',
      solution:
        'SELECT city, COUNT(*) AS member_count FROM members GROUP BY city ORDER BY member_count DESC;',
    },
    {
      id: 'lib-3',
      title: 'Идэвхгүй гишүүд',
      task: '`is_active` нь FALSE байгаа гишүүдийн нэр, и-мэйлийг гарга.',
      expectedColumns: ['first_name', 'last_name', 'email'],
      hint: "WHERE is_active = FALSE — эсвэл `WHERE NOT is_active`",
      solution: 'SELECT first_name, last_name, email FROM members WHERE is_active = FALSE;',
    },
    {
      id: 'lib-4',
      title: 'Хамгийн эртний ном',
      task: 'Хамгийн эрт хэвлэгдсэн номын гарчиг болон он-г гарга.',
      expectedRowCount: 1,
      expectedColumns: ['title', 'published'],
      hint: 'ORDER BY published ASC LIMIT 1 — эсвэл WHERE published = (SELECT MIN(published) ...)',
      solution: 'SELECT title, published FROM books ORDER BY published ASC LIMIT 1;',
    },
    {
      id: 'lib-5',
      title: 'Зохиолч тус бүрийн ном',
      task: '3-аас дээш ном бичсэн зохиолчдын нэр болон номын тоог гарга. Багана: first_name, last_name, book_count.',
      expectedColumns: ['first_name', 'last_name', 'book_count'],
      hint: 'JOIN authors → books, GROUP BY, HAVING COUNT(*) > 3',
      solution: `SELECT a.first_name, a.last_name, COUNT(*) AS book_count
FROM authors a JOIN books b ON a.author_id = b.author_id
GROUP BY a.author_id, a.first_name, a.last_name
HAVING COUNT(*) > 3 ORDER BY book_count DESC;`,
    },
  ],
}
