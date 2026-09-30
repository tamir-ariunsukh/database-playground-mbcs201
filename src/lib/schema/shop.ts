import { SeededRandom, isoDate, mongolianEmail, mongolianName, mongolianPhone } from '../seed'
import type { DomainDefinition } from './types'

/**
 * Online Shop — цахим дэлгүүрийн систем.
 *
 * Гол онцлог: order_items хүснэгт нь COMPOSITE PRIMARY KEY-тэй
 * (order_id, product_id) — Week 3-4-ийн чухал ойлголт.
 * Мөн олон-олон (many-to-many) хамаарлыг завсрын хүснэгтээр
 * хэрхэн шийдэхийг харуулна.
 */

const DDL = `
CREATE TABLE categories (
  category_id  SERIAL PRIMARY KEY,
  name         VARCHAR(60) NOT NULL UNIQUE,
  parent_id    INT REFERENCES categories(category_id)
);

CREATE TABLE customers (
  customer_id  SERIAL PRIMARY KEY,
  first_name   VARCHAR(50) NOT NULL,
  last_name    VARCHAR(50) NOT NULL,
  email        VARCHAR(120) NOT NULL UNIQUE,
  phone        VARCHAR(20),
  city         VARCHAR(50),
  registered_on DATE NOT NULL,
  loyalty_tier VARCHAR(20) NOT NULL DEFAULT 'Энгийн'
    CHECK (loyalty_tier IN ('Энгийн', 'Мөнгө', 'Алт', 'Платин'))
);

CREATE TABLE products (
  product_id   SERIAL PRIMARY KEY,
  name         VARCHAR(150) NOT NULL,
  category_id  INT NOT NULL REFERENCES categories(category_id),
  price        NUMERIC(10,2) NOT NULL CHECK (price > 0),
  cost         NUMERIC(10,2) CHECK (cost > 0),
  stock        INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  supplier     VARCHAR(80),
  discontinued BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE orders (
  order_id     SERIAL PRIMARY KEY,
  customer_id  INT NOT NULL REFERENCES customers(customer_id),
  order_date   TIMESTAMP NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'Хүлээгдэж буй'
    CHECK (status IN ('Хүлээгдэж буй', 'Төлөгдсөн', 'Хүргэгдсэн', 'Цуцлагдсан', 'Буцаагдсан')),
  shipping_city VARCHAR(50),
  shipping_fee NUMERIC(8,2) DEFAULT 0 CHECK (shipping_fee >= 0),
  total_amount NUMERIC(12,2) CHECK (total_amount >= 0)
);

CREATE TABLE order_items (
  order_id     INT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  product_id   INT NOT NULL REFERENCES products(product_id),
  quantity     INT NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(10,2) NOT NULL CHECK (unit_price > 0),
  discount     NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount BETWEEN 0 AND 100),
  PRIMARY KEY (order_id, product_id)
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_date ON orders(order_date);
`.trim()

function generateSeed(): string {
  const rng = new SeededRandom('shop-v1')
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

  const out: string[] = ['-- Online Shop жишээ дата (seed: shop-v1)']

  // categories (12) — 4 нь parent, 8 нь дэд ангилал
  const parents: [string, number | null][] = [
    ['Электроник', null],
    ['Хувцас', null],
    ['Гэр ахуй', null],
    ['Спорт', null],
  ]
  out.push('\n-- categories: 12 мөр')
  parents.forEach(([name, parent]) => {
    out.push(`INSERT INTO categories (name, parent_id) VALUES (${q(name)}, ${q(parent)});`)
  })
  const children: [string, number][] = [
    ['Утас', 1], ['Зөөврийн компьютер', 1], ['Дагалдах хэрэгсэл', 1],
    ['Гутал', 2], ['Цамц', 2],
    ['Гал тогоо', 3], ['Тавилга', 3],
    ['Фитнес', 4],
  ]
  children.forEach(([name, parent]) => {
    out.push(`INSERT INTO categories (name, parent_id) VALUES (${q(name)}, ${parent});`)
  })

  // customers (70)
  out.push('\n-- customers: 70 мөр')
  for (let i = 1; i <= 70; i++) {
    const { first, last } = mongolianName(rng)
    const email = mongolianEmail(rng, first, last)
    const city = rng.weighted([
      { value: 'Улаанбаатар', weight: 55 },
      { value: 'Дархан', weight: 12 },
      { value: 'Эрдэнэт', weight: 10 },
      { value: 'Чойбалсан', weight: 8 },
      { value: 'Мөрөн', weight: 5 },
      { value: 'Ховд', weight: 4 },
      { value: 'Улаангом', weight: 3 },
      { value: 'Баянхонгор', weight: 3 },
    ])
    const reg = rng.dateBetween(new Date('2020-01-01'), new Date('2025-08-01'))
    const tier = rng.weighted([
      { value: 'Энгийн', weight: 55 },
      { value: 'Мөнгө', weight: 25 },
      { value: 'Алт', weight: 15 },
      { value: 'Платин', weight: 5 },
    ])
    out.push(
      `INSERT INTO customers (first_name, last_name, email, phone, city, registered_on, loyalty_tier) VALUES (${q(first)}, ${q(last)}, ${q(email)}, ${q(mongolianPhone(rng))}, ${q(city)}, ${q(isoDate(reg))}, ${q(tier)});`,
    )
  }

  // products (90)
  out.push('\n-- products: 90 мөр')
  const productNames: Record<number, string[]> = {
    5: ['Galaxy S24', 'iPhone 15', 'Redmi Note 13', 'Pixel 8', 'Nokia G42'],
    6: ['MacBook Air M3', 'ThinkPad X1', 'Aspire 5', 'Vivobook 15', 'Zenbook 14'],
    7: ['Bluetooth чихэвч', 'Цэнэглэгч', 'Хамгаалалтын гэр', 'USB кабель', 'Power bank'],
    8: ['Nike Air', 'Adidas Ultraboost', 'Puma RS-X', 'New Balance 574', 'Спорт гутал'],
    9: ['Оксфорд цамц', 'Футболк', 'Цамц', 'Поло цамц', 'Худи'],
    10: ['Хайруулын таваг', 'Хутганы багц', 'Хоолны багц', 'Цайны аяга', 'Хөргөгч'],
    11: ['Буйдан', 'Ширээ', 'Гэрлийн чийдэн', 'Хадгалах шүүгээ', 'Ор'],
    12: ['Гантель', 'Йога дэвсгэр', 'Дүүжин мод', 'Усны сав', 'Гүйлтийн гутал'],
  }
  const suppliers = ['Номин', 'Электроникс Монгол', 'Спорт Төв', 'Гэр Ахуй ХХК', 'Импорт Трейд']
  for (let i = 1; i <= 90; i++) {
    const catId = rng.weighted([
      { value: 5, weight: 16 }, { value: 6, weight: 14 }, { value: 7, weight: 14 },
      { value: 8, weight: 12 }, { value: 9, weight: 12 }, { value: 10, weight: 12 },
      { value: 11, weight: 10 }, { value: 12, weight: 10 },
    ])
    const base = rng.pick(productNames[catId])
    const name = rng.chance(0.3) ? `${base} ${rng.int(1, 3)}` : base
    const cost = Math.round(rng.float() * 1800000 + 25000)
    const price = Math.round(cost * (1.15 + rng.float() * 0.6))
    const stock = rng.weighted([
      { value: 0, weight: 8 },
      { value: rng.int(1, 10), weight: 22 },
      { value: rng.int(11, 50), weight: 40 },
      { value: rng.int(51, 200), weight: 30 },
    ])
    out.push(
      `INSERT INTO products (name, category_id, price, cost, stock, supplier, discontinued) VALUES (${q(name)}, ${catId}, ${price}, ${cost}, ${stock}, ${q(rng.pick(suppliers))}, ${q(rng.chance(0.08))});`,
    )
  }

  // orders (250) + order_items (~600)
  out.push('\n-- orders: 250 мөр')
  const statuses = ['Хүлээгдэж буй', 'Төлөгдсөн', 'Хүргэгдсэн', 'Цуцлагдсан', 'Буцаагдсан']
  let itemCount = 0
  const itemLines: string[] = ['\n-- order_items: ~600 мөр']

  for (let oid = 1; oid <= 250; oid++) {
    const custId = rng.int(1, 70)
    const orderDate = rng.dateBetween(new Date('2024-06-01'), new Date('2025-09-15'))
    const status = rng.weighted([
      { value: 'Хүргэгдсэн', weight: 50 },
      { value: 'Төлөгдсөн', weight: 18 },
      { value: 'Хүлээгдэж буй', weight: 14 },
      { value: 'Цуцлагдсан', weight: 10 },
      { value: 'Буцаагдсан', weight: 8 },
    ])
    const city = rng.weighted([
      { value: 'Улаанбаатар', weight: 60 },
      { value: 'Дархан', weight: 12 },
      { value: 'Эрдэнэт', weight: 10 },
      { value: 'Чойбалсан', weight: 8 },
      { value: 'Мөрөн', weight: 6 },
      { value: 'Ховд', weight: 4 },
    ])
    const shipFee = city === 'Улаанбаатар' ? rng.pick([0, 5000, 8000]) : rng.pick([12000, 15000, 20000])

    // 1-5 ширхэг бүтээгдэхүүн
    const nItems = rng.weighted([
      { value: 1, weight: 35 }, { value: 2, weight: 28 }, { value: 3, weight: 20 },
      { value: 4, weight: 12 }, { value: 5, weight: 5 },
    ])
    const chosen = new Set<number>()
    while (chosen.size < nItems) chosen.add(rng.int(1, 90))

    let total = 0
    const lines: string[] = []
    for (const pid of chosen) {
      const qty = rng.weighted([
        { value: 1, weight: 50 }, { value: 2, weight: 25 },
        { value: 3, weight: 15 }, { value: 5, weight: 10 },
      ])
      // unit_price түүхэн үнэ — products-ийн одоогийн үнээс бага зэрэг зөрүүтэй
      const unit = Math.round(rng.float() * 1500000 + 20000)
      const disc = rng.weighted([
        { value: 0, weight: 60 }, { value: 5, weight: 20 },
        { value: 10, weight: 12 }, { value: 15, weight: 5 }, { value: 20, weight: 3 },
      ])
      total += unit * qty * (1 - disc / 100)
      lines.push(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount) VALUES (${oid}, ${pid}, ${qty}, ${unit}, ${disc});`,
      )
      itemCount++
    }

    out.push(
      `INSERT INTO orders (customer_id, order_date, status, shipping_city, shipping_fee, total_amount) VALUES (${custId}, ${q(orderDate.toISOString().slice(0, 19).replace('T', ' '))}, ${q(status)}, ${q(city)}, ${shipFee}, ${Math.round(total + shipFee)});`,
    )
    itemLines.push(...lines)
  }

  out.push(...itemLines)
  out.push(`\n-- Нийт ${12 + 70 + 90 + 250 + itemCount} мөр оруулсан`)
  return out.join('\n')
}

export const shopDomain: DomainDefinition = {
  id: 'shop',
  label: 'Цахим дэлгүүр',
  weeks: [3, 4, 5, 6, 7, 9, 10, 12, 13],
  description:
    'Онлайн дэлгүүрийн систем: бүтээгдэхүүн, захиалга, захиалгын мөр. Composite primary key болон many-to-many хамаарлыг харуулна.',
  ddl: DDL,
  seed: generateSeed(),
  examples: [
    {
      title: 'Нөөц дууссан бүтээгдэхүүн',
      week: 5,
      sql: `SELECT product_id, name, price, stock
FROM products
WHERE stock = 0 AND discontinued = FALSE
ORDER BY price DESC;`,
      mongo: `db.products.find(
  { stock: 0, discontinued: false },
  { product_id: 1, name: 1, price: 1, stock: 1 }
).sort({ price: -1 })`,
      explanation:
        'AND нь хоёр нөхцөлийг зэрэг биелүүлэхийг шаардана. `stock = 0` болон `discontinued = FALSE` — энэ нь бодит дэлгүүрт "дахин захиалах ёстой" жагсаалт.',
    },
    {
      title: 'Нэрэнд "цамц" орсон бүтээгдэхүүн',
      week: 5,
      sql: `SELECT name, price
FROM products
WHERE name LIKE '%цамц%'
ORDER BY price;`,
      mongo: `db.products.find(
  { name: { $regex: "цамц", $options: "i" } },
  { name: 1, price: 1 }
).sort({ price: 1 })`,
      explanation:
        'LIKE \'%цамц%\' нь хаана ч байсан "цамц" гэсэн хэсгийг хайна. Postgres-д `ILIKE` нь том/жижиг үсгийг ялгахгүй. MongoDB-д `$regex` + `$options: \'i\'`.',
    },
    {
      title: 'Захиалгын нийт дүн ба мөрийн тоо',
      week: 7,
      sql: `SELECT COUNT(*) AS order_count,
       ROUND(SUM(total_amount), 2) AS revenue,
       ROUND(AVG(total_amount), 2) AS avg_order,
       MAX(total_amount) AS biggest_order
FROM orders
WHERE status NOT IN ('Цуцлагдсан', 'Буцаагдсан');`,
      mongo: `db.orders.aggregate([
  { $match: { status: { $nin: ["Цуцлагдсан", "Буцаагдсан"] } } },
  { $group: {
      _id: null,
      order_count: { $sum: 1 },
      revenue: { $sum: "$total_amount" },
      avg_order: { $avg: "$total_amount" },
      biggest_order: { $max: "$total_amount" }
  }}
])`,
      explanation:
        "`NOT IN` нь жагсаалтын аль нэгтэй тохирохгүй гэсэн үг. MongoDB-д `$nin`. Цуцлагдсан захиалгыг орлогоос хасах нь бодит бизнесийн логик.",
    },
    {
      title: 'Хамгийн их орлог авчирсан 10 бүтээгдэхүүн',
      week: 9,
      sql: `SELECT p.name,
       SUM(oi.quantity) AS units_sold,
       ROUND(SUM(oi.quantity * oi.unit_price * (1 - oi.discount/100)), 2) AS revenue
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
JOIN orders o ON oi.order_id = o.order_id
WHERE o.status = 'Хүргэгдсэн'
GROUP BY p.product_id, p.name
ORDER BY revenue DESC
LIMIT 10;`,
      explanation:
        'Гурван хүснэгтийн JOIN. `1 - oi.discount/100` нь хямдралыг тооцсон бодит үнэ. ⚠️ `NUMERIC` хуваалт бүхэл тоо болохгүй — Postgres-д зөв.',
    },
    {
      title: 'Хэзээ ч захиалга хийгээгүй харилцагч',
      week: 9,
      sql: `SELECT c.customer_id, c.first_name, c.last_name, c.email
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
WHERE o.order_id IS NULL
ORDER BY c.registered_on;`,
      explanation:
        'LEFT JOIN + IS NULL = anti-join. Бодит бизнест "идэвхжүүлэх" кампанит ажилд ашиглана. Энэ query-г INNER JOIN-оор бичвэл үр дүн ХООСОН гарна — тэр нь алдаа.',
    },
    {
      title: 'Дундаж захиалгын дүнгээс их харилцагчид (subquery)',
      week: 10,
      sql: `SELECT c.first_name, c.last_name, o.total_amount
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.total_amount > (
  SELECT AVG(total_amount) FROM orders WHERE status = 'Хүргэгдсэн'
)
ORDER BY o.total_amount DESC
LIMIT 15;`,
      explanation:
        'Subquery нь нэг утга буцааж, гадаад query түүнтэй харьцуулна. Ижил query-г `HAVING AVG(...) OVER ()` window function-оор ч бичиж болно.',
    },
    {
      title: 'Ангилал тус бүрийн борлуулалт',
      week: 7,
      sql: `SELECT cat.name AS category,
       COUNT(DISTINCT o.order_id) AS orders,
       ROUND(SUM(oi.quantity * oi.unit_price), 2) AS gross
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
JOIN categories cat ON p.category_id = cat.category_id
JOIN orders o ON oi.order_id = o.order_id
GROUP BY cat.category_id, cat.name
HAVING SUM(oi.quantity * oi.unit_price) > 5000000
ORDER BY gross DESC;`,
      explanation:
        '`COUNT(DISTINCT ...)` нь давхардлыг арилгана — нэг захиалгад нэг ангиллын 3 бүтээгдэхүүн байвал 1 гэж тоолно. HAVING нь aggregate-ийн үр дүнг шүүнэ.',
    },
    {
      title: 'Захиалгын дэлгэрэнгүй (олон JOIN)',
      week: 9,
      sql: `SELECT o.order_id, o.order_date, o.status,
       c.first_name || ' ' || c.last_name AS customer,
       p.name AS product, oi.quantity, oi.unit_price
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
JOIN order_items oi ON o.order_id = oi.order_id
JOIN products p ON oi.product_id = p.product_id
WHERE o.order_id = 42;`,
      mongo: `db.orders.aggregate([
  { $match: { order_id: 42 } },
  { $lookup: { from: "customers", localField: "customer_id",
               foreignField: "customer_id", as: "customer" }},
  { $unwind: "$customer" },
  { $lookup: { from: "order_items", localField: "order_id",
               foreignField: "order_id", as: "items" }},
  { $unwind: "$items" }
])`,
      explanation:
        'Дөрвөн хүснэгтийн JOIN. `||` нь Postgres-д string холбоно (MySQL-д `CONCAT()`). Нэг захиалгын бүх мөрийг харах нь "order details" хуудасны ард байдаг query.',
    },
    {
      title: 'Сарын борлуулалтын чиг хандлага',
      week: 7,
      sql: `SELECT TO_CHAR(order_date, 'YYYY-MM') AS month,
       COUNT(*) AS orders,
       ROUND(SUM(total_amount), 2) AS revenue
FROM orders
WHERE status = 'Хүргэгдсэн'
GROUP BY TO_CHAR(order_date, 'YYYY-MM')
ORDER BY month;`,
      mongo: `db.orders.aggregate([
  { $match: { status: "Хүргэгдсэн" } },
  { $group: {
      _id: { $substr: ["$order_date", 0, 7] },
      orders: { $sum: 1 },
      revenue: { $sum: "$total_amount" }
  }},
  { $sort: { _id: 1 } }
])`,
      explanation:
        "`TO_CHAR` нь огноог текст болгоно — 'YYYY-MM' нь сар бүрээр бүлэглэх стандарт арга. MongoDB-д `$substr` эсвэл `$dateToString` ашиглана.",
    },
    {
      title: 'Олон удаа захиалсан харилцагчид',
      week: 10,
      sql: `SELECT c.first_name, c.last_name, c.loyalty_tier,
       COUNT(*) AS order_count,
       ROUND(SUM(o.total_amount), 2) AS lifetime_value
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
WHERE o.status = 'Хүргэгдсэн'
GROUP BY c.customer_id, c.first_name, c.last_name, c.loyalty_tier
HAVING COUNT(*) >= 5
ORDER BY lifetime_value DESC;`,
      explanation:
        "'Lifetime value' — бодит CRM системд хамгийн чухал хэмжүүр. HAVING нь COUNT-ийг шүүнэ, ORDER BY нь aggregate-ийн үр дүнгээр эрэмбэлнэ.",
    },
    {
      title: 'Бүтээгдэхүүний ашиг (window function)',
      week: 12,
      sql: `SELECT name, price, cost,
       ROUND(price - cost, 2) AS profit,
       ROUND((price - cost) / price * 100, 1) AS margin_pct,
       RANK() OVER (ORDER BY (price - cost) DESC) AS profit_rank
FROM products
WHERE cost IS NOT NULL AND discontinued = FALSE
ORDER BY profit DESC
LIMIT 20;`,
      explanation:
        '`RANK() OVER (ORDER BY ...)` нь window function — aggregate биш, мөр бүрд утга оноодог. Энэ нь Postgres-ийн хүчирхэг боломж, MySQL 8+ мөн дэмжинэ.',
    },
    {
      title: 'Захиалгын нийт дүнг шалгах (integrity)',
      week: 4,
      sql: `SELECT o.order_id, o.total_amount AS stored,
       ROUND(SUM(oi.quantity * oi.unit_price * (1 - oi.discount/100)) + o.shipping_fee, 2) AS calculated,
       ROUND(o.total_amount - (SUM(oi.quantity * oi.unit_price * (1 - oi.discount/100)) + o.shipping_fee), 2) AS diff
FROM orders o
JOIN order_items oi ON o.order_id = oi.order_id
GROUP BY o.order_id, o.total_amount, o.shipping_fee
HAVING ABS(o.total_amount - (SUM(oi.quantity * oi.unit_price * (1 - oi.discount/100)) + o.shipping_fee)) > 100
LIMIT 20;`,
      explanation:
        'Денормализаци хийсэн `total_amount` багана нь бодит нийлбэртэй таарах ёстой. Энэ query нь зөрүүтэй мөрүүдийг олж, өгөгдлийн бүрэн бүтэн байдлыг шалгана.',
    },
    {
      title: 'Transaction — захиалга үүсгэх',
      week: 13,
      category: 'transaction',
      mutates: true,
      sql: `BEGIN;

INSERT INTO orders (customer_id, order_date, status, shipping_city, shipping_fee, total_amount)
VALUES (10, NOW(), 'Хүлээгдэж буй', 'Улаанбаатар', 8000, 0)
RETURNING order_id;

-- Дараа нь order_items-д мөрүүдийг нэмнэ (order_id-г дээрх query-ээс авна)
-- INSERT INTO order_items (order_id, product_id, quantity, unit_price)
-- VALUES (<order_id>, 5, 2, 1500000);

-- Нөөцийг хасах ООЛОГ үйлдэл
UPDATE products SET stock = stock - 2 WHERE product_id = 5 AND stock >= 2;

-- total_amount-ийг тооцох
UPDATE orders SET total_amount = 1500000 * 2 + 8000 WHERE order_id = 1;

COMMIT;`,
      explanation:
        'Захиалга үүсгэх нь 3 үйлдэл: order нэмэх, order_items нэмэх, stock хасах. ACID-ийн Atomicity — аль нэг нь бүтэлгүйтвэл БҮГД цуцлагдана. Тэгэхгүй бол "төлсөн ч бараа байхгүй" нөхцөл үүснэ.',
    },
    {
      title: 'Хамгийн идэвхтэй харилцагчийн дэлгэрэнгүй (correlated)',
      week: 10,
      sql: `SELECT c.first_name, c.last_name, c.loyalty_tier,
       (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.customer_id) AS orders,
       (SELECT ROUND(SUM(total_amount), 2) FROM orders o
        WHERE o.customer_id = c.customer_id AND o.status = 'Хүргэгдсэн') AS spent
FROM customers c
ORDER BY spent DESC NULLS LAST
LIMIT 10;`,
      explanation:
        'Хоёр correlated subquery. Ижил үр дүнг LEFT JOIN + GROUP BY-ээр ч гаргаж болно — аль нь илүү уншигдахуйц вэ гэдэг нь чухал.',
    },
    {
      title: 'CHECK constraint — буруу тайер',
      week: 4,
      category: 'ddl',
      mutates: true,
      sql: `-- АЛДАА: 'Алмаз' нь зөвшөөрөгдсөн тайер биш
INSERT INTO customers (first_name, last_name, email, registered_on, loyalty_tier)
VALUES ('Тэст', 'Хэрэглэгч', 'test@example.mn', CURRENT_DATE, 'Алмаз');`,
      explanation:
        "`CHECK (loyalty_tier IN (...))` нь зөвхөн зөвшөөрөгдсөн утгуудыг л оруулна. Энэ нь ENUM-ийн оронд хэрэглэгддэг стандарт арга — өөрчлөхөд хялбар.",
    },
  ],
  challenges: [
    {
      id: 'shop-1',
      title: 'Үнэтэй бүтээгдэхүүн',
      task: '1,000,000₮-өөс дээш үнэтэй бүтээгдэхүүнүүдийг нэр, үнэ, нөөцөөр гарга. Үнээр буурах дарааллаар.',
      expectedColumns: ['name', 'price', 'stock'],
      hint: 'WHERE price > 1000000 ORDER BY price DESC',
      solution: 'SELECT name, price, stock FROM products WHERE price > 1000000 ORDER BY price DESC;',
    },
    {
      id: 'shop-2',
      title: 'Хотын захиалгын тоо',
      task: 'Хүргэлтийн хот тус бүрээр захиалгын тоог гарга. Багана: shipping_city, order_count.',
      expectedColumns: ['shipping_city', 'order_count'],
      hint: 'GROUP BY shipping_city',
      solution:
        'SELECT shipping_city, COUNT(*) AS order_count FROM orders GROUP BY shipping_city ORDER BY order_count DESC;',
    },
    {
      id: 'shop-3',
      title: 'Платин харилцагчид',
      task: '`loyalty_tier` нь "Платин" харилцагчдын нэр, и-мэйлийг гарга.',
      expectedColumns: ['first_name', 'last_name', 'email'],
      hint: "WHERE loyalty_tier = 'Платин'",
      solution:
        "SELECT first_name, last_name, email FROM customers WHERE loyalty_tier = 'Платин';",
    },
    {
      id: 'shop-4',
      title: 'Хамгийн их нөөц',
      task: 'Хамгийн их нөөцтэй бүтээгдэхүүний нэр болон нөөцийг гарга.',
      expectedRowCount: 1,
      expectedColumns: ['name', 'stock'],
      hint: 'ORDER BY stock DESC LIMIT 1',
      solution: 'SELECT name, stock FROM products ORDER BY stock DESC LIMIT 1;',
    },
    {
      id: 'shop-5',
      title: 'Идэвхтэй харилцагч',
      task: '5-аас дээш захиалга хийсэн харилцагчдын нэр болон захиалгын тоог гарга.',
      expectedColumns: ['first_name', 'last_name', 'order_count'],
      hint: 'JOIN customers → orders, GROUP BY, HAVING COUNT(*) > 5',
      solution: `SELECT c.first_name, c.last_name, COUNT(*) AS order_count
FROM customers c JOIN orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_id, c.first_name, c.last_name
HAVING COUNT(*) > 5 ORDER BY order_count DESC;`,
    },
  ],
}
