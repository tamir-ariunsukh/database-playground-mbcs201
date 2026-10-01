'use client'

import { useMemo, useState } from 'react'
import {
  BookOpen,
  Lightbulb,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Target,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useDb } from './DbProvider'
import { exampleFor } from '@/lib/engines'
import type { Challenge } from '@/lib/schema/types'
import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  type ExampleCategory,
} from '@/lib/schema/types'

/**
 * ExamplePanel — баруун талын самбар.
 *
 * Хоёр табтай:
 *   1. Жишээ — ангилалаар шүүж болох асуулгууд, тайлбартай
 *   2. Даалгавар — өөрийгөө шалгах бодлогууд
 *
 * Жишээ дээр дарахад editor-т орж, тэр даруй ажиллуулж болно.
 */

type Tab = 'examples' | 'challenges'

/** Ангилалын дараалал — энгийнээс нарийн руу. */
const CATEGORY_ORDER: ExampleCategory[] = [
  'ddl',
  'dml',
  'query',
  'transaction',
  'view-index',
  'normalization',
]

export function ExamplePanel({ onInsertQuery }: { onInsertQuery: (q: string) => void }) {
  const { domain, dbKind } = useDb()
  const [tab, setTab] = useState<Tab>('examples')

  // Ангилал тус бүрийн тоо — шүүлтүүрийн шошгонд харуулна.
  const counts = useMemo(() => {
    const m: Partial<Record<ExampleCategory, number>> = {}
    for (const ex of domain.examples) {
      const c = ex.category ?? 'query'
      m[c] = (m[c] ?? 0) + 1
    }
    return m
  }, [domain.examples])

  const availableCategories = CATEGORY_ORDER.filter((c) => counts[c])

  const [filter, setFilter] = useState<ExampleCategory | 'all'>('all')

  return (
    <aside className="flex h-full w-full flex-col border-l border-[var(--border)] bg-[var(--bg-alt)]">
      <div className="flex border-b border-[var(--border)]">
        <TabButton active={tab === 'examples'} onClick={() => setTab('examples')}>
          <BookOpen size={13} />
          Жишээ ({domain.examples.length})
        </TabButton>
        <TabButton active={tab === 'challenges'} onClick={() => setTab('challenges')}>
          <Target size={13} />
          Даалгавар ({domain.challenges.length})
        </TabButton>
      </div>

      {/* Ангилалын шүүлтүүр */}
      {tab === 'examples' && availableCategories.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-[var(--border)] px-2 py-2">
          <FilterChip
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            title="Бүх жишээ"
          >
            Бүгд {domain.examples.length}
          </FilterChip>
          {availableCategories.map((c) => (
            <FilterChip
              key={c}
              active={filter === c}
              onClick={() => setFilter(c)}
              title={CATEGORY_DESCRIPTIONS[c]}
            >
              {CATEGORY_LABELS[c]} {counts[c]}
            </FilterChip>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'examples' ? (
          <ExampleList onInsertQuery={onInsertQuery} dbKind={dbKind} filter={filter} />
        ) : (
          <ChallengeList onInsertQuery={onInsertQuery} />
        )}
      </div>
    </aside>
  )
}

function FilterChip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={clsx(
        'rounded-full border px-2 py-0.5 text-[10px] transition',
        active
          ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
          : 'border-[var(--border)] text-[var(--text-dim)] hover:bg-white/5 hover:text-[var(--text)]',
      )}
    >
      {children}
    </button>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition',
        active
          ? 'border-b-2 border-[var(--accent)] text-[var(--text)]'
          : 'border-b-2 border-transparent text-[var(--text-dim)] hover:text-[var(--text)]',
      )}
    >
      {children}
    </button>
  )
}

function ExampleList({
  onInsertQuery,
  dbKind,
  filter,
}: {
  onInsertQuery: (q: string) => void
  dbKind: 'postgres' | 'mysql' | 'mongodb'
  filter: ExampleCategory | 'all'
}) {
  const { domain } = useDb()
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  const shown = useMemo(
    () =>
      domain.examples
        .map((ex, i) => ({ ex, i }))
        .filter(({ ex }) => filter === 'all' || (ex.category ?? 'query') === filter),
    [domain.examples, filter],
  )

  // Ангилал солигдоход нээлттэй жишээг хаана.
  const [lastFilter, setLastFilter] = useState(filter)
  if (lastFilter !== filter) {
    setLastFilter(filter)
    setOpenIdx(null)
  }

  if (shown.length === 0) {
    return (
      <p className="p-4 text-xs leading-relaxed text-[var(--text-dim)]">
        Энэ ангилалд жишээ байхгүй.
      </p>
    )
  }

  return (
    <div>
      {shown.map(({ ex, i }) => {
        const open = openIdx === i
        const code = exampleFor(ex, dbKind)
        const isMongo = dbKind === 'mongodb'
        const category = ex.category ?? 'query'

        return (
          <div key={`${domain.id}-${i}`} className="border-b border-[var(--border)]/40">
            <button
              type="button"
              onClick={() => setOpenIdx(open ? null : i)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-white/[0.03]"
            >
              <span className="mt-0.5 shrink-0 text-[var(--text-dim)]">
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="block truncate text-xs font-medium text-[var(--text)]">
                    {ex.title}
                  </span>
                  {ex.mutates && (
                    <AlertTriangle
                      size={10}
                      className="shrink-0 text-amber-400"
                      aria-label="Өгөгдлийг өөрчилнө"
                    />
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
                  <span className="rounded bg-white/5 px-1.5 py-px">
                    {CATEGORY_LABELS[category]}
                  </span>
                  <span>Долоо хоног {ex.week}</span>
                  {ex.step && (
                    <span className="font-mono text-[9px] uppercase text-[var(--accent)]">
                      {ex.step}
                    </span>
                  )}
                </span>
              </span>
            </button>

            {open && (
              <div className="px-3 pb-3 animate-fade-in">
                {ex.mutates && (
                  <p className="mb-2 flex gap-1.5 rounded border border-amber-500/25 bg-amber-500/5 px-2 py-1.5 text-[10px] leading-relaxed text-amber-300/90">
                    <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                    Энэ асуулга өгөгдлийг өөрчилнө. Анхны байдалд буцаах бол зүүн
                    доод буланд «Өгөгдөл сэргээх» дарна уу.
                  </p>
                )}

                <pre className="mb-2 max-h-52 overflow-auto rounded border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-[10px] leading-relaxed text-[var(--text)]">
                  {code}
                </pre>

                {isMongo && !ex.mongo && (
                  <p className="mb-2 rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-300/90">
                    Энэ жишээнд MongoDB хувилбар байхгүй — SQL-ийг pipeline болгон
                    хөрвүүлэх даалгаврыг өөрөө хийгээрэй.
                  </p>
                )}

                <div className="mb-2 flex gap-2 text-[11px] leading-relaxed text-[var(--text-dim)]">
                  <Lightbulb size={12} className="mt-0.5 shrink-0 text-amber-400" />
                  <span className="whitespace-pre-wrap">{ex.explanation}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onInsertQuery(code)}
                  className="flex w-full items-center justify-center gap-1.5 rounded border border-[var(--border)] px-2 py-1.5 text-[11px] text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)]"
                >
                  Editor-т оруулах
                  <ArrowRight size={11} />
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ChallengeList({ onInsertQuery }: { onInsertQuery: (q: string) => void }) {
  const { domain, runQuery, result, queryError } = useDb()
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [showSolution, setShowSolution] = useState<Record<string, boolean>>({})

  // Хамгийн сүүлийн асуулгын үр дүнгээр даалгаврыг шалгана.
  const verdict = useMemo(() => {
    if (openIdx === null) return null
    const ch = domain.challenges[openIdx]
    if (!ch) return null
    if (queryError) return { ok: false, msg: 'Асуулга алдаатай байна.' }
    if (!result) return null

    if (ch.expectedRowCount !== undefined && result.rowCount !== ch.expectedRowCount) {
      return {
        ok: false,
        msg: `${ch.expectedRowCount} мөр байх ёстой, харин ${result.rowCount} мөр буцаалаа.`,
      }
    }
    if (ch.expectedColumns) {
      const missing = ch.expectedColumns.filter(
        (c) => !result.columns.includes(c) && !result.columns.some((rc) => rc.endsWith(`.${c}`)),
      )
      if (missing.length > 0) {
        return { ok: false, msg: `Дутуу багана: ${missing.join(', ')}` }
      }
    }
    if (result.rowCount === 0) {
      return { ok: false, msg: '0 мөр буцаалаа — нөхцөлөө шалгаарай.' }
    }
    return { ok: true, msg: `Зөв! ${result.rowCount} мөр буцаалаа.` }
  }, [openIdx, domain.challenges, result, queryError])

  return (
    <div>
      {domain.challenges.map((ch, i) => (
        <ChallengeItem
          key={ch.id}
          challenge={ch}
          index={i}
          open={openIdx === i}
          onToggle={() => {
            setOpenIdx(openIdx === i ? null : i)
          }}
          verdict={openIdx === i ? verdict : null}
          showSolution={!!showSolution[ch.id]}
          onToggleSolution={() =>
            setShowSolution((s) => ({ ...s, [ch.id]: !s[ch.id] }))
          }
          onInsertQuery={onInsertQuery}
          onRun={(q) => void runQuery(q)}
        />
      ))}
    </div>
  )
}

function ChallengeItem({
  challenge,
  index,
  open,
  onToggle,
  verdict,
  showSolution,
  onToggleSolution,
  onInsertQuery,
  onRun,
}: {
  challenge: Challenge
  index: number
  open: boolean
  onToggle: () => void
  verdict: { ok: boolean; msg: string } | null
  showSolution: boolean
  onToggleSolution: () => void
  onInsertQuery: (q: string) => void
  onRun: (q: string) => void
}) {
  return (
    <div className="border-b border-[var(--border)]/40">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-white/[0.03]"
      >
        <span
          className={clsx(
            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold',
            verdict?.ok
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-white/5 text-[var(--text-dim)]',
          )}
        >
          {verdict?.ok ? <Check size={10} /> : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-[var(--text)]">{challenge.title}</span>
        </span>
        <span className="mt-0.5 shrink-0 text-[var(--text-dim)]">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 animate-fade-in">
          <p className="mb-2 text-[11px] leading-relaxed text-[var(--text)]">{challenge.task}</p>

          <div className="mb-2 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5">
            <span className="flex gap-1.5 text-[10px] leading-relaxed text-[var(--text-dim)]">
              <Lightbulb size={11} className="mt-0.5 shrink-0 text-amber-400" />
              {challenge.hint}
            </span>
          </div>

          {verdict && (
            <div
              className={clsx(
                'mb-2 flex items-start gap-1.5 rounded px-2 py-1.5 text-[11px]',
                verdict.ok
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border border-rose-500/30 bg-rose-500/10 text-rose-300',
              )}
            >
              {verdict.ok ? (
                <Check size={12} className="mt-0.5 shrink-0" />
              ) : (
                <X size={12} className="mt-0.5 shrink-0" />
              )}
              {verdict.msg}
            </div>
          )}

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onInsertQuery(templateQuery(challenge))}
              className="flex-1 rounded border border-[var(--border)] px-2 py-1.5 text-[11px] text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)]"
            >
              Эхлэх
            </button>
            <button
              type="button"
              onClick={onToggleSolution}
              className="rounded border border-[var(--border)] px-2 py-1.5 text-[11px] text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)]"
            >
              {showSolution ? 'Хаах' : 'Хариулт'}
            </button>
          </div>

          {showSolution && (
            <div className="mt-2 animate-fade-in">
              <pre className="max-h-40 overflow-auto rounded border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-[10px] leading-relaxed text-[var(--text)]">
                {challenge.solution}
              </pre>
              <button
                type="button"
                onClick={() => onRun(challenge.solution)}
                className="mt-1.5 w-full rounded bg-[var(--accent)]/15 px-2 py-1.5 text-[11px] text-[var(--accent)] transition hover:bg-[var(--accent)]/25"
              >
                Хариултыг ажиллуулж шалгах
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Даалгаврын эхлэлийн загвар — хүснэгтийн нэрийг санал болгоно. */
function templateQuery(ch: Challenge): string {
  if (ch.solution.toUpperCase().startsWith('SELECT')) {
    return 'SELECT \nFROM \nWHERE \n'
  }
  return '-- Энд query бичээрэй\n'
}

export { ChallengeList }
