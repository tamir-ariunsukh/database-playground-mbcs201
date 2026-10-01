'use client'

import Link from 'next/link'
import { ArrowRight, Database, Table2, Code2, Layers } from 'lucide-react'

/**
 * Нүүр хуудас — төслийн танилцуулга.
 *
 * Чиглүүлэлт:
 *   /playground — үндсэн ажлын талбар (3 database)
 *   /about      — техникийн тайлбар, архитектур
 */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <header className="mb-12">
        <div className="mb-4 flex items-center gap-3">
          <Database size={24} className="text-[var(--accent)]" />
          <span className="rounded bg-white/5 px-2.5 py-1 text-xs text-[var(--text-dim)]">
            MBCS201
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">
          Database Playground
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-dim)]">
          Гурван өгөгдлийн сангийн асуулгыг browser дотор шууд ажиллуулж үзэх
          интерактив орчин. Сервер байхгүй — бүх зүйл таны компьютер дээр ажиллана.
        </p>

        <Link
          href="/playground"
          className="mt-6 inline-flex items-center gap-2 rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#0d1117] transition hover:brightness-110"
        >
          Эхлэх
          <ArrowRight size={15} />
        </Link>
      </header>

      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-dim)]">
          Гурван өгөгдлийн сан
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <DbCard
            title="PostgreSQL 17"
            subtitle="Жинхэнэ engine"
            color="#336791"
            points={[
              'WebAssembly-д компиляцлагдсан',
              'SELECT version() → жинхэнэ хувилбар',
              'Транзакц, EXPLAIN ANALYZE ажиллана',
            ]}
          />
          <DbCard
            title="MySQL"
            subtitle="Синтакс нийцэл"
            color="#00758f"
            points={[
              'alasql engine',
              'LIMIT, backtick, IFNULL()',
              'JOIN, GROUP BY бүрэн дэмжинэ',
            ]}
          />
          <DbCard
            title="MongoDB"
            subtitle="Баримт бичгийн сан"
            color="#4db33d"
            points={[
              'mingo engine',
              '$gt, $in, $regex операторууд',
              '$group, $lookup pipeline',
            ]}
          />
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-dim)]">
          Таван төслийн сэдэв
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['Номын сан', 'Ном, зохиолч, гишүүн, зээл'],
            ['Цахим дэлгүүр', 'Бүтээгдэхүүн, захиалга, төлбөр'],
            ['Эмнэлэг', 'Эмч, өвчтөн, цаг товлолт, жор'],
            ['Их сургууль', 'Оюутан, хичээл, багш, бүртгэл'],
            ['Зочид буудал', 'Өрөө, зочин, захиалга, төлбөр'],
          ].map(([title, desc]) => (
            <div
              key={title}
              className="rounded border border-[var(--border)] bg-[var(--bg-alt)] p-4"
            >
              <div className="flex items-center gap-2">
                <Table2 size={14} className="text-[var(--accent)]" />
                <h3 className="text-sm font-medium text-[var(--text)]">{title}</h3>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-dim)]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-dim)]">
          Хичээлийн сэдвүүд
        </h2>
        <div className="flex flex-wrap gap-2">
          {[
            'SELECT / WHERE',
            'ORDER BY',
            'CRUD',
            'NULL утга',
            'Нэгтгэх функц',
            'GROUP BY / HAVING',
            'JOIN',
            'Дэд асуулга',
            'EXISTS / IN',
            'Нормалчлал',
            'VIEW / INDEX',
            'Транзакц / ACID',
            'Аюулгүй байдал',
          ].map((t) => (
            <span
              key={t}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-dim)]"
            >
              {t}
            </span>
          ))}
        </div>

        <div className="mt-8 flex items-start gap-3 rounded border border-[var(--border)] bg-[var(--bg-alt)] p-4">
          <Layers size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" />
          <div>
            <h3 className="text-sm font-medium text-[var(--text)]">Нэг өгөгдөл, гурван хэл</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-dim)]">
              Сэдэв солиход ижил өгөгдөл гурван системд зэрэг бэлдэгдэнэ. Нэг
              асуулгыг PostgreSQL-д бичээд, дараа нь MongoDB-д хэрхэн хийхийг шууд
              харьцуулж болно.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded border border-[var(--border)] bg-[var(--bg-alt)] p-4">
          <Code2 size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" />
          <div>
            <h3 className="text-sm font-medium text-[var(--text)]">Аюулгүй</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-dim)]">
              Асуулга нь browser-ийн sandbox дотор л ажиллана. Мөр устгасан ч{' '}
              <span className="font-mono">Өгөгдөл сэргээх</span> товчоор анхны
              байдалд буцаана.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function DbCard({
  title,
  subtitle,
  color,
  points,
}: {
  title: string
  subtitle: string
  color: string
  points: string[]
}) {
  return (
    <div className="overflow-hidden rounded border border-[var(--border)] bg-[var(--bg-alt)]">
      <div className="h-1" style={{ background: color }} />
      <div className="p-4">
        <h3 className="text-sm font-medium text-[var(--text)]">{title}</h3>
        <p className="mt-0.5 text-[11px] text-[var(--text-dim)]">{subtitle}</p>
        <ul className="mt-3 space-y-1.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2 text-[11px] leading-relaxed text-[var(--text-dim)]">
              <span className="text-[var(--accent)]">·</span>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
