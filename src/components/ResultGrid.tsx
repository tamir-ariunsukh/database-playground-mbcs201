'use client'

import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Copy, Check } from 'lucide-react'
import type { DbKind, QueryResult } from '@/lib/types'

/**
 * ResultGrid — query-гийн үр дүнг хүснэгт хэлбэрээр харуулна.
 *
 * Боломжууд:
 *   - Багана тус бүрээр эрэмбэлэх (толгой дээр дарах)
 *   - NULL утгыг тусгай өнгөөр тодруулах
 *   - Тоог баруун тийш зэрэгцүүлэх
 *   - Хуулах (TSV) болон CSV татах
 *   - Олон мөртэй үед виртуал скролл
 */

interface Props {
  result: QueryResult
  dbKind?: DbKind
}

export function ResultGrid({ result, dbKind = 'postgres' }: Props) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [copied, setCopied] = useState(false)

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      result.columns.map((col) => ({
        id: col,
        accessorFn: (row) => row[col],
        header: col,
        cell: (info) => <CellValue value={info.getValue()} />,
        sortingFn: (a, b) => compareValues(a.getValue(col), b.getValue(col)),
      })),
    [result.columns],
  )

  const table = useReactTable({
    data: result.rows as Record<string, unknown>[],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const copyTsv = async () => {
    const header = result.columns.join('\t')
    const body = table
      .getRowModel()
      .rows.map((r) => result.columns.map((c) => stringify(r.original[c])).join('\t'))
      .join('\n')
    try {
      await navigator.clipboard.writeText(`${header}\n${body}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard API байхгүй бол чимээгүй алгасна.
    }
  }

  const downloadCsv = () => {
    const esc = (v: unknown) => {
      const s = stringify(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = result.columns.map(esc).join(',')
    const body = table
      .getRowModel()
      .rows.map((r) => result.columns.map((c) => esc(r.original[c])).join(','))
      .join('\n')
    const blob = new Blob([`\uFEFF${header}\n${body}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query-result-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // SELECT биш (DDL/DML) бол grid биш, мэдэгдэл харуулна
  if (result.columns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-lg text-center animate-fade-in">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-2xl">
            ✓
          </div>
          <p className="text-base font-medium text-emerald-400">
            {result.notice ?? 'Амжилттай ажиллалаа.'}
          </p>
          <p className="mt-2 font-mono text-xs text-[var(--text-dim)]">
            {result.durationMs.toFixed(1)} ms
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Толгойн мөр — статистик ба үйлдлүүд */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border)] bg-[var(--bg-alt)] px-3 py-2 text-xs">
        <span className="font-medium text-[var(--text)]">
          {result.rowCount.toLocaleString()} мөр
        </span>
        <span className="text-[var(--text-dim)]">{result.columns.length} багана</span>
        <span className="font-mono text-[var(--text-dim)]">
          {result.durationMs.toFixed(1)} ms
        </span>

        {result.truncated && (
          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-400">
            {dbKind === 'mongodb'
              ? `Эхний ${result.rowCount.toLocaleString()} мөрийг харуулав — .limit() нэмэгдлээ`
              : `Эхний ${result.rowCount.toLocaleString()} мөрийг харуулав — LIMIT нэмэгдлээ`}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={copyTsv}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)]"
            title="TSV хэлбэрээр хуулах"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Хуулагдлаа' : 'Хуулах'}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)]"
            title="CSV татах"
          >
            <Download size={13} />
            CSV
          </button>
        </div>
      </div>

      {/* Хүснэгт */}
      <div className="result-grid min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--bg-alt)]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th className="w-10 border-b border-r border-[var(--border)] px-2 py-1.5 text-right font-mono font-normal text-[var(--text-dim)]">
                  #
                </th>
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="cursor-pointer select-none border-b border-r border-[var(--border)] px-3 py-1.5 text-left font-medium text-[var(--text)] transition hover:bg-white/5"
                      title="Эрэмбэлэхийн тулд дарна уу"
                    >
                      <span className="flex items-center gap-1.5">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="text-[var(--text-dim)]">
                          {sorted === 'asc' ? (
                            <ArrowUp size={11} />
                          ) : sorted === 'desc' ? (
                            <ArrowDown size={11} />
                          ) : (
                            <ChevronsUpDown size={11} className="opacity-30" />
                          )}
                        </span>
                      </span>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                className="border-b border-[var(--border)]/50 transition hover:bg-white/[0.03]"
              >
                <td className="border-r border-[var(--border)]/50 px-2 py-1 text-right font-mono text-[var(--text-dim)]">
                  {i + 1}
                </td>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="max-w-md truncate border-r border-[var(--border)]/50 px-3 py-1"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {result.rowCount === 0 && (
          <div className="p-8 text-center text-sm text-[var(--text-dim)]">
            Query амжилттай ажилласан ч <span className="font-mono">0</span> мөр буцаалаа.
            <br />
            <span className="text-xs">
              Нөхцөл (WHERE) хэт хатуу байж болзошгүй — сулруулж үзээрэй.
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Нэг нүдийг утгын төрлөөр нь зөв харуулна. */
function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="italic text-[var(--text-dim)]/60">NULL</span>
  }
  if (typeof value === 'boolean') {
    return (
      <span className={value ? 'text-emerald-400' : 'text-rose-400'}>
        {value ? 'true' : 'false'}
      </span>
    )
  }
  if (typeof value === 'number') {
    return <span className="font-mono tabular-nums">{value.toLocaleString()}</span>
  }
  if (Array.isArray(value)) {
    return <span className="font-mono text-violet-400">[{value.length} элемент]</span>
  }
  if (typeof value === 'object') {
    return (
      <span className="font-mono text-violet-400" title={JSON.stringify(value)}>
        {JSON.stringify(value)}
      </span>
    )
  }
  const s = String(value)
  // Огноо/цаг
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return <span className="font-mono text-sky-300">{s}</span>
  }
  return <span>{s}</span>
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** Утгуудыг төрлийг харгалзан харьцуулна. */
function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), 'mn')
}
