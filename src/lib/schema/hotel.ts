import { SeededRandom, isoDate, isoDate as _iso, mongolianEmail, mongolianName, mongolianPhone } from '../seed'
import type { DomainDefinition } from './types'

/**
 * Hotel — зочид буудлын захиалгын систем.
 *
 * Гол онцлог: rooms нь room_types-аас хамаарна (1:N), bookings нь
 * guests ↔ rooms хоёрыг холбоно. Мөн CHECK хязгаараар
 * checkout_date > checkin_date баталгаажуулна — огнооны логик.
 */

const DDL = `
CREATE TABLE room_types (
  type_id      SERIAL PRIMARY KEY,
  name         VARCHAR(40) NOT NULL UNIQUE,
  base_price   NUMERIC(10,2) NOT NULL CHECK (base_price > 0),
  capacity     INT NOT NULL CHECK (capacity BETWEEN 1 AND 8),
  description  TEXT
);

CREATE TABLE rooms (
  room_id      SERIAL PRIMARY KEY,
  room_number  VARCHAR(8) NOT NULL UNIQUE,
  type_id      INT NOT NULL REFERENCES room_types(type_id),
  floor        INT NOT NULL CHECK (floor BETWEEN 1 AND 15),
  has_balcony  BOOLEAN NOT NULL DEFAULT FALSE,
  status       VARCHAR(20) NOT NULL DEFAULT 'Бэлэн'
    CHECK (status IN ('Бэлэн', 'Зассан', 'Засвартай', 'Хаалттай'))
);

CREATE TABLE guests (
  guest_id     SERIAL PRIMARY KEY,
  first_name   VARCHAR(50) NOT NULL,
  last_name    VARCHAR(50) NOT NULL,
  email        VARCHAR(120) UNIQUE,
  phone        VARCHAR(20),
  country      VARCHAR(40) NOT NULL,
  passport_no  VARCHAR(20) UNIQUE,
  registered_on DATE NOT NULL
);

CREATE TABLE bookings (
  booking_id    SERIAL PRIMARY KEY,
  guest_id      INT NOT NULL REFERENCES guests(guest_id) ON DELETE CASCADE,
  room_id       INT NOT NULL REFERENCES rooms(room_id),
  checkin_date  DATE NOT NULL,
  checkout_date DATE NOT NULL,
  nights        INT NOT NULL CHECK (nights > 0),
  guests_count  INT NOT NULL CHECK (guests_count BETWEEN 1 AND 8),
  status        VARCHAR(20) NOT NULL DEFAULT 'Баталгаажсан'
    CHECK (status IN ('Баталгаажсан', 'Ирсэн', 'Дууссан', 'Цуцлагдсан', 'Ирээгүй')),
  total_price   NUMERIC(12,2) NOT NULL CHECK (total_price >= 0),
  CHECK (checkout_date > checkin_date)
);

CREATE TABLE payments (
  payment_id    SERIAL PRIMARY KEY,
  booking_id    INT NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method        VARCHAR(20) NOT NULL
    CHECK (method IN ('Бэлэн', 'Карт', 'Шилжүүлэг', 'Онлайн')),
  paid_at       TIMESTAMP NOT NULL,
  is_refunded   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_rooms_type ON rooms(type_id);
CREATE INDEX idx_bookings_guest ON bookings(guest_id);
CREATE INDEX idx_bookings_room ON bookings(room_id);
CREATE INDEX idx_bookings_dates ON bookings(checkin_date, checkout_date);
`.trim()

function generateSeed(): string {
  const rng = new SeededRandom('hotel-v1')
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

  const out: string[] = ['-- Зочид буудлын жишээ өгөгдөл (seed: hotel-v1)']

  const roomTypes: [string, number, number, string][] = [
    ['Стандарт', 120000, 2, 'Энгийн өрөө, 2 хүн'],
    ['Делюкс', 220000, 3, 'Өргөн өрөө, тагттай'],
    ['Люкс', 380000, 4, 'Тусдаа зочны өрөө'],
    ['Гэр бүлийн', 290000, 5, 'Хүүхэдтэй гэр бүлд'],
    ['Эдийн засаг', 75000, 1, 'Нэг хүний энгийн өрөө'],
    ['Президентийн', 850000, 4, 'Хамгийн тансаг'],
  ]
  out.push('\n-- room_types: 6 мөр')
  roomTypes.forEach(([name, price, cap, desc]) => {
    out.push(
      `INSERT INTO room_types (name, base_price, capacity, description) VALUES (${q(name)}, ${price}, ${cap}, ${q(desc)});`,
    )
  })

  out.push('\n-- rooms: 120 мөр')
  let roomNo = 101
  for (let i = 1; i <= 120; i++) {
    const floor = Math.floor((i - 1) / 12) + 1
    const typeId = rng.weighted([
      { value: 1, weight: 35 }, { value: 2, weight: 25 },
      { value: 5, weight: 18 }, { value: 4, weight: 12 },
      { value: 3, weight: 8 }, { value: 6, weight: 2 },
    ])
    const idxOnFloor = ((i - 1) % 12) + 1
    const num = `${floor}${String(idxOnFloor).padStart(2, '0')}`
    roomNo = Number(num)
    void roomNo
    const balcony = rng.chance(0.4)
    const status = rng.weighted([
      { value: 'Бэлэн', weight: 78 }, { value: 'Зассан', weight: 10 },
      { value: 'Засвартай', weight: 8 }, { value: 'Хаалттай', weight: 4 },
    ])
    out.push(
      `INSERT INTO rooms (room_number, type_id, floor, has_balcony, status) VALUES (${q(num)}, ${typeId}, ${floor}, ${q(balcony)}, ${q(status)});`,
    )
  }

  out.push('\n-- guests: 180 мөр')
  const countries = ['Монгол', 'Монгол', 'Монгол', 'Хятад', 'Орос', 'Солонгос',
    'Япон', 'Америк', 'Герман', 'Франц', 'Англи', 'Австрали']
  const passportPool = new Set<string>()
  for (let i = 1; i <= 180; i++) {
    const { first, last } = mongolianName(rng)
    const country = rng.weighted([
      { value: 'Монгол', weight: 40 },
      { value: 'Хятад', weight: 12 },
      { value: 'Орос', weight: 10 },
      { value: 'Солонгос', weight: 10 },
      { value: 'Япон', weight: 8 },
      { value: 'Америк', weight: 7 },
      { value: 'Герман', weight: 5 },
      { value: 'Франц', weight: 4 },
      { value: 'Англи', weight: 2 },
      { value: 'Австрали', weight: 2 },
    ])
    let passport = `${country === 'Монгол' ? 'MN' : 'XX'}${rng.int(1000000, 9999999)}`
    while (passportPool.has(passport)) passport = `MN${rng.int(1000000, 9999999)}`
    passportPool.add(passport)
    const reg = rng.dateBetween(new Date('2019-01-01'), new Date('2025-09-01'))
    const email = rng.chance(0.85) ? mongolianEmail(rng, first, last) : null

    out.push(
      `INSERT INTO guests (first_name, last_name, email, phone, country, passport_no, registered_on) VALUES (${q(first)}, ${q(last)}, ${email ? q(email) : 'NULL'}, ${q(mongolianPhone(rng))}, ${q(country)}, ${q(passport)}, ${q(isoDate(reg))});`,
    )
    void countries
  }

  out.push('\n-- bookings: 350 мөр')
  const bookingLines: string[] = []
  const paymentLines: string[] = ['\n-- payments: ~400 мөр']
  let payCount = 0
  const roomPrices: Record<number, number> = { 1: 120000, 2: 220000, 3: 380000, 4: 290000, 5: 75000, 6: 850000 }

  for (let bid = 1; bid <= 350; bid++) {
    const guestId = rng.int(1, 180)
    const roomId = rng.int(1, 120)
    const checkin = rng.dateBetween(new Date('2024-06-01'), new Date('2025-11-01'))
    const nights = rng.weighted([
      { value: 1, weight: 18 }, { value: 2, weight: 26 },
      { value: 3, weight: 22 }, { value: 4, weight: 14 },
      { value: 5, weight: 8 }, { value: 7, weight: 7 },
      { value: 10, weight: 3 }, { value: 14, weight: 2 },
    ])
    const checkout = new Date(checkin)
    checkout.setDate(checkout.getDate() + nights)

    const now = new Date('2025-09-30')
    let status: string
    if (checkout < now) status = rng.chance(0.88) ? 'Дууссан' : 'Цуцлагдсан'
    else if (checkin <= now && checkout >= now) status = 'Ирсэн'
    else status = rng.weighted([
      { value: 'Баталгаажсан', weight: 82 },
      { value: 'Цуцлагдсан', weight: 12 },
      { value: 'Ирээгүй', weight: 6 },
    ])

    // Өрөөний төрлийг олж үнэ бодно (rooms.type_id-г ID-аар нь ойролцоогоор)
    const rtype = Math.min(6, Math.max(1, Math.ceil(roomId / 40) + rng.int(-1, 1)))
    const basePrice = roomPrices[rtype] ?? 120000
    const guestsCount = rng.weighted([
      { value: 1, weight: 22 }, { value: 2, weight: 38 },
      { value: 3, weight: 22 }, { value: 4, weight: 13 },
      { value: 5, weight: 5 },
    ])
    const total = basePrice * nights

    bookingLines.push(
      `INSERT INTO bookings (guest_id, room_id, checkin_date, checkout_date, nights, guests_count, status, total_price) VALUES (${guestId}, ${roomId}, ${q(isoDate(checkin))}, ${q(isoDate(checkout))}, ${nights}, ${guestsCount}, ${q(status)}, ${total});`,
    )

    // Төлбөр — цуцлагдаагүй бол 1-2 төлбөр
    if (status !== 'Цуцлагдсан') {
      const nPay = rng.weighted([{ value: 1, weight: 78 }, { value: 2, weight: 22 }])
      let remaining = total
      for (let k = 0; k < nPay; k++) {
        const amt = k === nPay - 1 ? remaining : Math.round(total / 2)
        remaining -= amt
        const paidAt = rng.dateBetween(checkin, new Date('2025-10-01'))
        const method = rng.weighted([
          { value: 'Карт', weight: 45 }, { value: 'Бэлэн', weight: 25 },
          { value: 'Онлайн', weight: 20 }, { value: 'Шилжүүлэг', weight: 10 },
        ])
        const refunded = status === 'Ирээгүй' && rng.chance(0.5)
        paymentLines.push(
          `INSERT INTO payments (booking_id, amount, method, paid_at, is_refunded) VALUES (${bid}, ${Math.abs(amt)}, ${q(method)}, ${q(paidAt.toISOString().slice(0, 19).replace('T', ' '))}, ${q(refunded)});`,
        )
        payCount++
      }
    }
  }

  out.push(...bookingLines)
  out.push(...paymentLines)
  out.push(`\n-- Нийт ${6 + 120 + 180 + 350 + payCount} мөр оруулсан`)
  void _iso
  return out.join('\n')
}

export const hotelDomain: DomainDefinition = {
  id: 'hotel',
  label: 'Зочид буудал',
  weeks: [2, 3, 4, 5, 6, 7, 9, 10, 12, 13],
  description:
    'Зочид буудлын захиалга: өрөө, зочин, захиалга, төлбөр. Огнооны логик, CHECK хязгаар, транзакц үзэхэд тохиромжтой.',
  ddl: DDL,
  seed: generateSeed(),
  examples: [
    {
      title: 'Бэлэн өрөөнүүд',
      week: 5,
      sql: `SELECT r.room_number, rt.name AS type, rt.base_price, r.floor, r.has_balcony
FROM rooms r
JOIN room_types rt ON r.type_id = rt.type_id
WHERE r.status = 'Бэлэн' AND rt.base_price < 250000
ORDER BY rt.base_price, r.room_number
LIMIT 20;`,
      explanation:
        'JOIN + WHERE. `rt.base_price < 250000` нь холбоотой хүснэгтийн баганыг шүүж байна — энэ нь JOIN-ийн дараа ажиллана.',
    },
    {
      title: 'Орлогын статистик',
      week: 7,
      sql: `SELECT COUNT(*) AS bookings,
       ROUND(SUM(total_price), 2) AS gross_revenue,
       ROUND(AVG(total_price), 2) AS avg_booking,
       ROUND(AVG(nights), 1) AS avg_nights,
       MAX(nights) AS longest_stay
FROM bookings
WHERE status IN ('Дууссан', 'Ирсэн');`,
      explanation:
        'Таван нэгтгэх функц нэг асуулгад. `IN (\'Дууссан\', \'Ирсэн\')` нь зөвхөн бодит орлого авчирсан захиалгыг тоолно — цуцлагдсаныг хасах нь чухал.',
    },
    {
      title: 'Хамгийн их орлого авчирсан өрөөний төрөл',
      week: 9,
      sql: `SELECT rt.name AS room_type,
       COUNT(*) AS bookings,
       ROUND(SUM(b.total_price), 2) AS revenue,
       ROUND(AVG(b.nights), 1) AS avg_nights
FROM bookings b
JOIN rooms r ON b.room_id = r.room_id
JOIN room_types rt ON r.type_id = rt.type_id
WHERE b.status IN ('Дууссан', 'Ирсэн')
GROUP BY rt.type_id, rt.name
ORDER BY revenue DESC;`,
      explanation:
        'Гурван хүснэгтийн JOIN + GROUP BY. Хамгийн их орлого авчирсан төрлийг олох нь үнийн стратегид шууд нөлөөлнө.',
    },
    {
      title: 'Одоо буудаллаж байгаа зочид',
      week: 5,
      sql: `SELECT g.first_name, g.last_name, g.country,
       r.room_number, b.checkin_date, b.checkout_date, b.guests_count
FROM bookings b
JOIN guests g ON b.guest_id = g.guest_id
JOIN rooms r ON b.room_id = r.room_id
WHERE b.status = 'Ирсэн'
ORDER BY b.checkout_date;`,
      explanation:
        '`status = \'Ирсэн\'` нь яг одоо буудаллаж байгаа гэсэн үг. `ORDER BY checkout_date` нь хамгийн түрүүнд гарах зочдыг эхэнд тавина — ресепшнд ашигтай.',
    },
    {
      title: 'Олон удаа ирсэн зочин',
      week: 7,
      sql: `SELECT g.first_name, g.last_name, g.country,
       COUNT(*) AS total_bookings,
       ROUND(SUM(b.total_price), 2) AS lifetime_value
FROM guests g
JOIN bookings b ON g.guest_id = b.guest_id
WHERE b.status IN ('Дууссан', 'Ирсэн')
GROUP BY g.guest_id, g.first_name, g.last_name, g.country
HAVING COUNT(*) >= 3
ORDER BY lifetime_value DESC
LIMIT 15;`,
      explanation:
        'Давтан ирдэг зочид — лояалти программын үндэс. `HAVING COUNT(*) >= 3` нь 3-аас дээш удаа ирсэн хүмүүсийг л авна.',
    },
    {
      title: 'Буудалж байгаагүй зочин',
      week: 9,
      sql: `SELECT g.guest_id, g.first_name, g.last_name, g.registered_on
FROM guests g
LEFT JOIN bookings b ON g.guest_id = b.guest_id
WHERE b.booking_id IS NULL
ORDER BY g.registered_on DESC;`,
      explanation:
        'Anti-join. Бүртгэлтэй ч захиалга хийгээгүй — маркетингийн кампанит ажилд зориулсан жагсаалт.',
    },
    {
      title: 'Сарын орлого',
      week: 7,
      sql: `SELECT TO_CHAR(checkin_date, 'YYYY-MM') AS month,
       COUNT(*) AS bookings,
       SUM(nights) AS total_nights,
       ROUND(SUM(total_price), 2) AS revenue
FROM bookings
WHERE status IN ('Дууссан', 'Ирсэн')
GROUP BY TO_CHAR(checkin_date, 'YYYY-MM')
ORDER BY month;`,
      explanation:
        'Сарын чиг хандлага. `SUM(nights)` нь нийт хоногийн тоо — occupancy rate бодохын тулд шаардлагатай.',
    },
    {
      title: 'Хамгийн урт хугацаагаар буусан зочин',
      week: 10,
      sql: `SELECT g.first_name, g.last_name, g.country,
       b.checkin_date, b.checkout_date, b.nights, b.total_price
FROM bookings b
JOIN guests g ON b.guest_id = g.guest_id
WHERE b.nights = (SELECT MAX(nights) FROM bookings WHERE status IN ('Дууссан', 'Ирсэн'))
ORDER BY b.total_price DESC;`,
      explanation:
        'Скаляр дэд асуулга нэг утга буцаана. Хэд хэдэн захиалга ижил `nights`-тай байж болзошгүй тул ORDER BY-г нэмсэн.',
    },
    {
      title: 'Төлбөрийн аргын тархалт',
      week: 7,
      sql: `SELECT method,
       COUNT(*) AS transactions,
       ROUND(SUM(amount), 2) AS total,
       ROUND(AVG(amount), 2) AS avg_amount,
       COUNT(*) FILTER (WHERE is_refunded) AS refunds
FROM payments
GROUP BY method
ORDER BY total DESC;`,
      explanation:
        '`COUNT(*) FILTER (WHERE is_refunded)` — буцаагдсан төлбөрийн тоо. Энэ нь `boolean` баганад `FILTER` хэрэглэх цэвэр арга (өөрөөр `WHERE` гэж бичих болно).',
    },
    {
      title: 'Дундажаас урт буусан захиалга (дэд асуулга)',
      week: 10,
      sql: `SELECT b.booking_id, g.last_name, b.nights, b.total_price
FROM bookings b
JOIN guests g ON b.guest_id = g.guest_id
WHERE b.nights > (SELECT AVG(nights) FROM bookings)
  AND b.status = 'Дууссан'
ORDER BY b.nights DESC, b.total_price DESC
LIMIT 20;`,
      explanation:
        'Дэд асуулга нь бүх захиалгын дундаж хоногийг бодно. Гадаад асуулга дараа нь түүнээс урт захиалгыг л авна.',
    },
    {
      title: 'Өрөөний ачаалалт (occupancy)',
      week: 9,
      sql: `SELECT rt.name AS room_type,
       COUNT(r.room_id) AS total_rooms,
       COUNT(b.booking_id) AS total_bookings,
       ROUND(COUNT(b.booking_id) * 1.0 / COUNT(r.room_id), 2) AS bookings_per_room
FROM room_types rt
JOIN rooms r ON rt.type_id = r.type_id
LEFT JOIN bookings b ON r.room_id = b.room_id
  AND b.status IN ('Дууссан', 'Ирсэн')
GROUP BY rt.type_id, rt.name
ORDER BY bookings_per_room DESC;`,
      explanation:
        '⚠️ `AND` нөхцөлийг `LEFT JOIN`-ийн `ON` дотор тавьсан — энэ нь `WHERE`-д тавихаас ЯЛГААТАЙ. WHERE-д тавьбал бүх захиалгагүй өрөө алга болж, LEFT JOIN нь INNER JOIN болно.',
    },
    {
      title: 'View — захиалгын дэлгэрэнгүй',
      week: 12,
      sql: `CREATE VIEW booking_details AS
SELECT b.booking_id, b.status,
       g.first_name || ' ' || g.last_name AS guest_name,
       g.country,
       r.room_number, rt.name AS room_type,
       b.checkin_date, b.checkout_date, b.nights,
       b.total_price,
       COALESCE(SUM(p.amount) FILTER (WHERE NOT p.is_refunded), 0) AS paid
FROM bookings b
JOIN guests g ON b.guest_id = g.guest_id
JOIN rooms r ON b.room_id = r.room_id
JOIN room_types rt ON r.type_id = rt.type_id
LEFT JOIN payments p ON b.booking_id = p.booking_id
GROUP BY b.booking_id, b.status, g.first_name, g.last_name, g.country,
         r.room_number, rt.name, b.checkin_date, b.checkout_date, b.nights, b.total_price;

-- Төлөгдөөгүй үлдэгдэлтэй захиалга
SELECT booking_id, guest_name, total_price, paid, total_price - paid AS balance
FROM booking_details
WHERE total_price > paid AND status NOT IN ('Цуцлагдсан', 'Ирээгүй')
ORDER BY balance DESC;`,
      explanation:
        'VIEW дотор JOIN + GROUP BY + FILTER + COALESCE — бүгд нэг дор. `COALESCE(..., 0)` нь төлбөргүй захиалганд 0 гаргана (SUM нь NULL буцаадаг).',
    },
    {
      title: 'Транзакц — захиалга үүсгэх',
      week: 13,
      category: 'transaction',
      mutates: true,
      sql: `BEGIN;

-- Захиалга үүсгэх
INSERT INTO bookings (guest_id, room_id, checkin_date, checkout_date, nights, guests_count, status, total_price)
VALUES (5, 12, '2025-11-01', '2025-11-04', 3, 2, 'Баталгаажсан', 660000)
RETURNING booking_id;

-- Урьдчилгаа төлбөр
INSERT INTO payments (booking_id, amount, method, paid_at)
VALUES (351, 200000, 'Карт', NOW());

-- Өрөөний төлөв
UPDATE rooms SET status = 'Зассан' WHERE room_id = 12;

COMMIT;`,
      explanation:
        'Захиалга үүсгэх нь 3 үйлдэл. ACID-ийн Atomicity — хэрэв төлбөр бүртгэгдэхгүй бол захиалга ч үлдэхгүй. `RETURNING booking_id` нь PostgreSQL-ийн маш хэрэгтэй боломж — шинэ ID-г шууд авна.',
    },
    {
      title: 'CHECK хязгаар — буруу огноо',
      week: 4,
      category: 'ddl',
      mutates: true,
      sql: `-- АЛДАА: checkout нь checkin-ээс өмнө байж болохгүй
INSERT INTO bookings (guest_id, room_id, checkin_date, checkout_date, nights, guests_count, total_price)
VALUES (1, 1, '2025-11-10', '2025-11-05', 2, 2, 240000);`,
      explanation:
        '`CHECK (checkout_date > checkin_date)` нь огнооны логикийг DBMS түвшинд баталгаажуулна. Мөн `nights > 0` — хоёр хязгаар хамт өгөгдлийн утга учиртай байдлыг хамгаална.',
    },
    {
      title: 'Төлбөр бүрэн төлөгдсөн эсэх шалгалт',
      week: 10,
      sql: `SELECT b.booking_id, b.total_price,
       COALESCE(SUM(p.amount) FILTER (WHERE NOT p.is_refunded), 0) AS paid,
       b.total_price - COALESCE(SUM(p.amount) FILTER (WHERE NOT p.is_refunded), 0) AS balance
FROM bookings b
LEFT JOIN payments p ON b.booking_id = p.booking_id
WHERE b.status = 'Дууссан'
GROUP BY b.booking_id, b.total_price
HAVING b.total_price <> COALESCE(SUM(p.amount) FILTER (WHERE NOT p.is_refunded), 0)
ORDER BY balance DESC
LIMIT 20;`,
      explanation:
        'Денормализаци хийсэн `total_price` ба payments-ийн нийлбэр таарахгүй захиалгуудыг олно. `<>` нь "тэнцүү биш". Ийм асуулга нь санхүүгийн аудитад өдөр бүр ажилладаг.',
    },
  ],
  challenges: [
    {
      id: 'hotel-1',
      title: 'Үнэтэй өрөөний төрөл',
      task: '300,000₮-өөс дээш үнэтэй өрөөний төрлүүдийг нэр, үнэ, багтаамжаар гарга. Үнээр буурах дарааллаар.',
      expectedColumns: ['name', 'base_price', 'capacity'],
      hint: 'WHERE base_price > 300000 ORDER BY base_price DESC',
      solution:
        'SELECT name, base_price, capacity FROM room_types WHERE base_price > 300000 ORDER BY base_price DESC;',
    },
    {
      id: 'hotel-2',
      title: 'Улсаар зочдын тоо',
      task: 'Улс тус бүрээр зочдын тоог гарга. Багана: country, guest_count.',
      expectedColumns: ['country', 'guest_count'],
      hint: 'GROUP BY country',
      solution:
        'SELECT country, COUNT(*) AS guest_count FROM guests GROUP BY country ORDER BY guest_count DESC;',
    },
    {
      id: 'hotel-3',
      title: 'Засвартай өрөө',
      task: '`status` нь "Засвартай" өрөөнүүдийн дугаар болон давхарыг гарга.',
      expectedColumns: ['room_number', 'floor'],
      hint: "WHERE status = 'Засвартай'",
      solution: "SELECT room_number, floor FROM rooms WHERE status = 'Засвартай' ORDER BY floor, room_number;",
    },
    {
      id: 'hotel-4',
      title: 'Хамгийн урт хугацааны захиалга',
      task: 'Хамгийн олон хоног буусан захиалгын booking_id болон хоногийн тоог гарга.',
      expectedColumns: ['booking_id', 'nights'],
      hint: 'ORDER BY nights DESC LIMIT 1',
      solution: 'SELECT booking_id, nights FROM bookings ORDER BY nights DESC LIMIT 1;',
    },
    {
      id: 'hotel-5',
      title: 'Давтан ирдэг зочин',
      task: '3-аас дээш захиалга хийсэн зочдын нэр болон захиалгын тоог гарга.',
      expectedColumns: ['first_name', 'last_name', 'booking_count'],
      hint: 'JOIN guests → bookings, GROUP BY, HAVING COUNT(*) > 3',
      solution: `SELECT g.first_name, g.last_name, COUNT(*) AS booking_count
FROM guests g JOIN bookings b ON g.guest_id = b.guest_id
GROUP BY g.guest_id, g.first_name, g.last_name
HAVING COUNT(*) > 3 ORDER BY booking_count DESC;`,
    },
  ],
}
