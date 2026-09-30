'use client'

import { AlertCircle, Loader2 } from 'lucide-react'
import type { QueryError } from '@/lib/types'

/**
 * ErrorPanel — query-гийн алдааг ойлгомжтой харуулна.
 *
 * Postgres-ийн алдааны кодыг монгол зөвлөгөө болгон харуулна.
 * Хүүхэд "яагаад ажиллахгүй байна" гэдгийг ойлгох нь чухал.
 */
export function ErrorPanel({
  error,
  query,
  onFix,
}: {
  error: QueryError
  query?: string
  onFix?: (sql: string) => void
}) {
  const lineInfo = error.position ? positionToLine(query ?? '', error.position) : null

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-3xl animate-fade-in">
        <div className="flex gap-3 rounded border border-rose-500/30 bg-rose-500/10 p-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-400" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-rose-400">
                {error.dbKind === 'postgres'
                  ? 'PostgreSQL алдаа'
                  : error.dbKind === 'mysql'
                    ? 'MySQL алдаа'
                    : 'MongoDB алдаа'}
              </span>
              {lineInfo && (
                <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[10px] text-rose-300">
                  Мөр {lineInfo.line}, багана {lineInfo.col}
                </span>
              )}
            </div>

            <p className="mt-1.5 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-rose-200">
              {error.message}
            </p>

            {error.detail && (
              <p className="mt-2 border-t border-rose-500/20 pt-2 text-[11px] leading-relaxed text-rose-300/80">
                <span className="font-medium">Дэлгэрэнгүй:</span> {error.detail}
              </p>
            )}

            {error.hint && (
              <div className="mt-2 rounded border border-amber-500/25 bg-amber-500/5 px-2.5 py-2">
                <p className="text-[11px] font-medium text-amber-400">💡 Зөвлөгөө</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-amber-200/90">
                  {error.hint}
                </p>
              </div>
            )}
          </div>
        </div>

        {query && lineInfo && (
          <div className="mt-3 overflow-hidden rounded border border-[var(--border)]">
            <div className="border-b border-[var(--border)] bg-[var(--bg-alt)] px-3 py-1.5 text-[10px] uppercase tracking-wide text-[var(--text-dim)]">
              Таны query
            </div>
            <pre className="overflow-auto bg-[var(--bg)] p-3 font-mono text-[11px] leading-relaxed">
              {query.split('\n').map((line, i) => (
                <div
                  key={i}
                  className={
                    lineInfo.line === i + 1
                      ? 'bg-rose-500/15 -mx-3 px-3 text-rose-200'
                      : 'text-[var(--text-dim)]'
                  }
                >
                  <span className="mr-3 inline-block w-6 select-none text-right opacity-50">
                    {i + 1}
                  </span>
                  {line}
                </div>
              ))}
            </pre>
          </div>
        )}

        {onFix && query && (
          <button
            type="button"
            onClick={() => onFix(query)}
            className="mt-3 rounded border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)]"
          >
            Query-г засах
          </button>
        )}
      </div>
    </div>
  )
}

/** Query-гийн текстийг ашиглан алдааны байрлалыг мөр/багана болгоно. */
function positionToLine(sql: string, pos: number): { line: number; col: number } | null {
  if (!sql || pos < 1) return null
  const before = sql.slice(0, pos)
  const lines = before.split('\n')
  return { line: lines.length, col: lines[lines.length - 1].length + 1 }
}

/** Ачаалж байх үеийн дэлгэц. */
export function LoadingPanel({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
      <div className="text-center">
        <p className="text-sm text-[var(--text)]">{message}</p>
        <p className="mt-2 max-w-xs text-xs leading-relaxed text-[var(--text-dim)]">
          PostgreSQL-ийг WebAssembly хэлбэрээр browser-т ачаалж байна. Энэ нь нэг л удаа
          хийгдэнэ — дараа нь кэшээс шууд ачаална.
        </p>
      </div>
    </div>
  )
}
