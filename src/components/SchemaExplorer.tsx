'use client'

import { useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Key,
  Link2,
  Table2,
  Loader2,
  RotateCcw,
  AlertCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useDb } from './DbProvider'
import type { ColumnMeta, DbKind } from '@/lib/types'

/**
 * SchemaExplorer — зүүн талын самбар.
 *
 * Харуулна:
 *   - Domain сонголт (5 mini project сэдэв)
 *   - Database сонголт (Postgres / MySQL / MongoDB)
 *   - Хүснэгтүүдийн жагсаалт, багана, төрөл, PRIMARY/FOREIGN KEY
 *   - Мөрийн тоо
 *   - Хүснэгт дээр дарахад `SELECT * FROM ...` автоматаар editor-т очно
 */

interface Props {
  onInsertQuery: (q: string) => void
}

export function SchemaExplorer({ onInsertQuery }: Props) {
  const { tables, loading, loadingMessage, domain, domains, selectDomain, dbKind, reset, error } =
    useDb()
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [resetting, setResetting] = useState(false)

  const handleReset = async () => {
    setResetting(true)
    await reset()
    setResetting(false)
  }

  const tableNames = tables.map((t) => t.name)

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-alt)]">
      {/* Domain сонголт */}
      <div className="border-b border-[var(--border)] p-3">
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
          Төслийн сэдэв
        </label>
        <select
          value={domain.id}
          onChange={(e) => selectDomain(e.target.value)}
          disabled={loading}
          className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)] disabled:opacity-50"
        >
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-dim)]">
          {domain.description}
        </p>
      </div>

      {/* Database сонголт */}
      <DbSwitcher />

      {/* Хүснэгтүүд */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
            Хүснэгтүүд ({tables.length})
          </span>
        </div>

        {loading && (
          <div className="flex items-center gap-2 px-3 py-4 text-xs text-[var(--text-dim)]">
            <Loader2 size={13} className="animate-spin" />
            {loadingMessage}
          </div>
        )}

        {error && (
          <div className="mx-3 my-2 flex gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {!loading &&
          tables.map((t) => (
            <TableItem
              key={t.name}
              table={t}
              open={!!open[t.name]}
              onToggle={() => setOpen((o) => ({ ...o, [t.name]: !o[t.name] }))}
              onSelect={() => {
                if (dbKind === 'mongodb') {
                  onInsertQuery(`db.${t.name}.find({})`)
                } else {
                  onInsertQuery(`SELECT * FROM ${t.name} LIMIT 50;`)
                }
              }}
            />
          ))}
      </div>

      {/* Reset */}
      <div className="border-t border-[var(--border)] p-3">
        <button
          type="button"
          onClick={handleReset}
          disabled={loading || resetting}
          className="flex w-full items-center justify-center gap-2 rounded border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)] disabled:opacity-50"
          title="Бүх датаг анхны байдалд буцаана"
        >
          {resetting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
          Дата сэргээх
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-dim)]/70">
          Query-ээр дата устгасан ч энэ товчоор анхны байдалд буцаана.
        </p>
      </div>

      {/* Autocomplete-д зориулж tableNames-ийг ашиглана */}
      <datalist id="table-names">
        {tableNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </aside>
  )
}

/** Database солих товчнууд. */
function DbSwitcher() {
  const { dbKind, selectDb, domain } = useDb()

  const dbs: { kind: DbKind; label: string; color: string; note: string }[] = [
    { kind: 'postgres', label: 'PostgreSQL', color: '#336791', note: 'Жинхэнэ Postgres 17 (WASM)' },
    { kind: 'mysql', label: 'MySQL', color: '#00758f', note: 'MySQL-нийцэлтэй (alasql)' },
    { kind: 'mongodb', label: 'MongoDB', color: '#4db33d', note: 'Document store (mingo)' },
  ]

  return (
    <div className="border-b border-[var(--border)] p-3">
      <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
        Өгөгдлийн сан
      </label>
      <div className="grid grid-cols-3 gap-1">
        {dbs.map((db) => (
          <button
            key={db.kind}
            type="button"
            onClick={() => selectDb(db.kind)}
            title={db.note}
            className={clsx(
              'rounded border px-1 py-2 text-[10px] font-medium transition',
              dbKind === db.kind
                ? 'border-transparent text-white'
                : 'border-[var(--border)] text-[var(--text-dim)] hover:bg-white/5 hover:text-[var(--text)]',
            )}
            style={dbKind === db.kind ? { background: db.color } : undefined}
          >
            {db.kind === 'postgres' ? 'Postgres' : db.kind === 'mysql' ? 'MySQL' : 'Mongo'}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-dim)]/80">
        <span className="font-medium text-[var(--text-dim)]">{domain.label}</span> — ижил дата,
        3 өөр query хэл.
      </p>
    </div>
  )
}

/** Нэг хүснэгтийн мөр — дарж дэлгэрэнгүйг харна. */
function TableItem({
  table,
  open,
  onToggle,
  onSelect,
}: {
  table: { name: string; columns: ColumnMeta[]; rowCount: number }
  open: boolean
  onToggle: () => void
  onSelect: () => void
}) {
  return (
    <div className="border-b border-[var(--border)]/40">
      <div className="group flex items-center gap-1 px-2 py-1.5 transition hover:bg-white/[0.03]">
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded p-0.5 text-[var(--text-dim)] transition hover:bg-white/5"
          aria-label={open ? 'Хаах' : 'Нээх'}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          title={`SELECT * FROM ${table.name} — editor-т оруулах`}
        >
          <Table2 size={13} className="shrink-0 text-[var(--text-dim)]" />
          <span className="truncate font-mono text-xs text-[var(--text)]">{table.name}</span>
          <span className="ml-auto shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-dim)]">
            {table.rowCount.toLocaleString()}
          </span>
        </button>
      </div>

      {open && (
        <ul className="pb-1.5 pl-8 pr-3 animate-fade-in">
          {table.columns.map((c) => (
            <li key={c.name} className="flex items-center gap-1.5 py-0.5 text-[11px]">
              {c.isPrimaryKey ? (
                <Key size={10} className="shrink-0 text-amber-400" />
              ) : c.isForeignKey ? (
                <Link2 size={10} className="shrink-0 text-sky-400" />
              ) : (
                <span className="w-[10px] shrink-0" />
              )}
              <span className="truncate font-mono text-[var(--text)]/90">{c.name}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--text-dim)]/70">
                {shortType(c.type)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Postgres-ийн урт төрлийн нэрийг товчлоно. */
function shortType(t: string): string {
  const map: Record<string, string> = {
    'character varying': 'varchar',
    'timestamp without time zone': 'timestamp',
    'timestamp with time zone': 'timestamptz',
    'double precision': 'float8',
  }
  return map[t] ?? t
}
