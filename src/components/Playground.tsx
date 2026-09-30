'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Database, History } from 'lucide-react'
import { clsx } from 'clsx'
import { useDb } from '@/components/DbProvider'
import { SchemaExplorer } from '@/components/SchemaExplorer'
import { ExamplePanel } from '@/components/ExamplePanel'
import { QueryEditor } from '@/components/QueryEditor'
import { ResultGrid } from '@/components/ResultGrid'
import { ErrorPanel, LoadingPanel } from '@/components/ErrorPanel'
import type { DbKind } from '@/lib/types'

/**
 * Playground — үндсэн ажлын талбар.
 *
 * Гурван баганат бүтэц:
 *   Зүүн:   Schema explorer (domain, database, хүснэгтүүд)
 *   Гол:    Query editor + үр дүнгийн grid
 *   Баруун: Жишээ болон дасгалууд
 *
 * Энэ бол JupyterLab эсвэл DBeaver-ийн browser хувилбар.
 */

const DEFAULT_QUERIES: Record<DbKind, string> = {
  postgres: 'SELECT * FROM books LIMIT 20;',
  mysql: 'SELECT * FROM books LIMIT 20;',
  mongodb: 'db.books.find({}).limit(20)',
}

export function Playground() {
  const { domain, dbKind, loading, loadingMessage, result, queryError, error, running, history } =
    useDb()

  const [query, setQuery] = useState(DEFAULT_QUERIES[dbKind])
  const [showHistory, setShowHistory] = useState(false)
  const [rightWidth, setRightWidth] = useState(360)
  const dragging = useRef(false)

  /*
   * Editor-ийг дахин үүсгэх түлхүүр.
   *
   * `query` state нь `value` prop-оор editor руу очно. Гэхдээ
   * @uiw/react-codemirror нь гаднаас `value` өөрчлөгдөхөд
   * editor-ийн агуулгыг шинэчлэхгүй. Тиймээс бид `key`-г сольж
   * editor-ийг бүхэлд нь дахин байгуулна.
   */
  const [editorKey, setEditorKey] = useState(0)

  const loadQuery = useCallback((q: string) => {
    setQuery(q)
    setEditorKey((k) => k + 1)
  }, [])

  /*
   * Database солигдоход:
   *   - Хэрэглэгч default query-г л харж байсан бол шинийг тавина
   *   - Гэхдээ editor-ийг ЯМАР Ч тохиолдолд дахин үүсгэнэ, учир нь
   *     MongoDB ↔ SQL хоёрын syntax highlight өөрчлөгдөх ёстой.
   *   - Бичсэн текстээ хадгална (хэрэглэгч шилжиж үзэх дуртай).
   */
  const prevDb = useRef(dbKind)
  useEffect(() => {
    if (prevDb.current === dbKind) return
    prevDb.current = dbKind

    setQuery((q) => {
      const wasDefault = Object.values(DEFAULT_QUERIES).includes(q.trim())
      return wasDefault ? DEFAULT_QUERIES[dbKind] : q
    })
    setEditorKey((k) => k + 1)
  }, [dbKind])

  // Domain солигдоход бүх default query-г шинээр тавина.
  const prevDomain = useRef(domain.id)
  useEffect(() => {
    if (prevDomain.current === domain.id) return
    prevDomain.current = domain.id

    setQuery((q) => {
      const wasDefault = Object.values(DEFAULT_QUERIES).includes(q.trim())
      return wasDefault ? DEFAULT_QUERIES[dbKind] : q
    })
    setEditorKey((k) => k + 1)
  }, [domain.id, dbKind])

  // Баруун самбарын өргөнийг чирж өөрчлөх
  const onMouseDown = useCallback(() => {
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const w = window.innerWidth - e.clientX
      setRightWidth(Math.min(560, Math.max(240, w)))
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)]">
      {/* Дээд мөр */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-alt)] px-4">
        <Database size={16} className="text-[var(--accent)]" />
        <h1 className="text-sm font-semibold text-[var(--text)]">
          Database Playground
        </h1>
        <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-[var(--text-dim)]">
          MBCS201
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-[var(--text-dim)] sm:inline">
            {domain.label}
          </span>
          <span className="text-[var(--text-dim)]/40">·</span>
          <DbBadge kind={dbKind} />
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className={clsx(
              'flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition',
              showHistory
                ? 'bg-white/10 text-[var(--text)]'
                : 'text-[var(--text-dim)] hover:bg-white/5 hover:text-[var(--text)]',
            )}
            title="Query-ний түүх"
          >
            <History size={13} />
            Түүх
            {history.length > 0 && (
              <span className="rounded bg-white/10 px-1 font-mono text-[9px]">
                {history.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Үндсэн агуулга */}
      <div className="flex min-h-0 flex-1">
        <SchemaExplorer onInsertQuery={loadQuery} />

        <main className="flex min-w-0 flex-1 flex-col">
          {/* Editor */}
          <div className="h-[38%] min-h-[180px] shrink-0 border-b border-[var(--border)]">
            <QueryEditor
              value={query}
              onChange={setQuery}
              dbKind={dbKind}
              resetKey={`${domain.id}-${editorKey}`}
            />
          </div>

          {/* Үр дүн */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <LoadingPanel message={loadingMessage} />
            ) : error ? (
              <ErrorPanel
                error={{
                  name: 'QueryError',
                  message: error,
                  dbKind,
                } as never}
              />
            ) : queryError ? (
              <ErrorPanel error={queryError} query={query} onFix={setQuery} />
            ) : result ? (
              <ResultGrid result={result} dbKind={dbKind} />
            ) : (
              <EmptyState />
            )}
          </div>
        </main>

        {/* Чирэх зурвас */}
        <div
          onMouseDown={onMouseDown}
          className="w-1 shrink-0 cursor-col-resize bg-transparent transition hover:bg-[var(--accent)]/40"
          title="Чирж өргөнийг өөрчлөх"
        />

        {showHistory ? (
          <HistoryPanel onSelect={loadQuery} width={rightWidth} />
        ) : (
          <div style={{ width: rightWidth }} className="shrink-0">
            <ExamplePanel onInsertQuery={loadQuery} />
          </div>
        )}
      </div>
    </div>
  )
}

function DbBadge({ kind }: { kind: DbKind }) {
  const map: Record<DbKind, { label: string; color: string }> = {
    postgres: { label: 'PostgreSQL 17', color: 'bg-[#336791]' },
    mysql: { label: 'MySQL', color: 'bg-[#00758f]' },
    mongodb: { label: 'MongoDB', color: 'bg-[#4db33d]' },
  }
  const { label, color } = map[kind]
  return (
    <span className={clsx('rounded px-2 py-0.5 text-[10px] font-medium text-white', color)}>
      {label}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
          <Database size={20} className="text-[var(--text-dim)]" />
        </div>
        <p className="text-sm text-[var(--text)]">Query бичээд Enter дарна уу</p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-dim)]">
          <span className="font-mono">Ctrl</span> +{' '}
          <span className="font-mono">Enter</span> — бүх query
          <br />
          Текст сонгоод <span className="font-mono">Ctrl</span> +{' '}
          <span className="font-mono">Enter</span> — зөвхөн сонгосон хэсэг
        </p>
        <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-dim)]/70">
          Зүүн талаас хүснэгт дээр дарж эхлэх, эсвэл баруун талаас жишээ сонгоно уу.
        </p>
      </div>
    </div>
  )
}

function HistoryPanel({
  onSelect,
  width,
}: {
  onSelect: (q: string) => void
  width: number
}) {
  const { history } = useDb()

  return (
    <aside
      style={{ width }}
      className="flex h-full shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-alt)]"
    >
      <div className="border-b border-[var(--border)] px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">
        Query-ний түүх ({history.length})
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {history.length === 0 && (
          <p className="p-4 text-xs leading-relaxed text-[var(--text-dim)]">
            Одоохондоо түүх байхгүй. Query ажиллуулсны дараа энд харагдана.
          </p>
        )}
        {history.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => onSelect(h.query)}
            className="block w-full border-b border-[var(--border)]/40 px-3 py-2 text-left transition hover:bg-white/[0.03]"
          >
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  h.success ? 'bg-emerald-400' : 'bg-rose-400',
                )}
              />
              <span className="truncate font-mono text-[10px] text-[var(--text-dim)]">
                {h.dbKind}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[9px] text-[var(--text-dim)]/60">
                {h.success ? `${h.rowCount ?? 0} мөр` : 'алдаа'}
              </span>
            </div>
            <pre className="mt-1 line-clamp-2 whitespace-pre-wrap break-all font-mono text-[10px] leading-snug text-[var(--text)]/80">
              {h.query}
            </pre>
          </button>
        ))}
      </div>
    </aside>
  )
}
