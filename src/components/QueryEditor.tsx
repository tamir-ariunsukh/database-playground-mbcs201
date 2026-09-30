'use client'

import { useEffect, useMemo, useRef } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { sql, PostgreSQL, MySQL } from '@codemirror/lang-sql'
import { javascript } from '@codemirror/lang-javascript'
import { EditorView } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { Play, RotateCcw, Loader2 } from 'lucide-react'
import type { DbKind } from '@/lib/types'
import { useDb } from './DbProvider'

/**
 * QueryEditor — CodeMirror 6 дээр суурилсан SQL/Mongo editor.
 *
 * Гол боломжууд:
 *   - Ctrl/Cmd + Enter → query ажиллуулах (бүх IDE-ийн стандарт)
 *   - Сонгосон хэсгийг л ажиллуулах (текст сонгосон бол)
 *   - Database-ээс хамаарч syntax highlight солигдоно
 *   - Schema-аас багана/хүснэгтийн нэрсийн autocomplete
 *
 * Чухал техникийн шийдэл:
 *   Ctrl+Enter-ийг DOM listener биш, CodeMirror-ийн `domEventHandlers`
 *   extension-ээр бүртгэнэ. DOM listener нь React-ийн ref timing болон
 *   `key` солигдох үед алдагдаж, "query ажиллахгүй байна" гэсэн
 *   төөрөгдөл үүсгэдэг. Extension нь editor state-ийн нэг хэсэг тул
 *   ямар ч тохиолдолд зөв ажиллана.
 */

interface Props {
  value: string
  onChange: (v: string) => void
  dbKind: DbKind
  /** Өөрчлөгдөхөд editor-ийг дахин үүсгэнэ (domain/database солих үед). */
  resetKey?: string
}

export function QueryEditor({ value, onChange, dbKind, resetKey = '' }: Props) {
  const { runQuery, running, tables } = useDb()
  const editorRef = useRef<ReactCodeMirrorRef>(null)

  /*
   * Хамгийн сүүлийн `runQuery`-г ref-д хадгална.
   * Ингэснээр extension нэг л удаа үүсээд, дараа нь өөрчлөгдсөн ч
   * хамгийн шинэ функцийг дуудна — editor дахин үүсэхгүй.
   */
  const runRef = useRef(runQuery)
  runRef.current = runQuery

  /*
   * Ctrl/Cmd + Enter handler.
   *
   * `Prec.highest` нь бусад extension-үүдээс (autocomplete, bracket
   * matching) өмнө ажиллахыг баталгаажуулна.
   */
  const runKeymap = useMemo(
    () =>
      Prec.highest(
        EditorView.domEventHandlers({
          keydown: (event, view) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault()
              const sel = view.state.selection.main
              const text = sel.empty
                ? view.state.doc.toString()
                : view.state.sliceDoc(sel.from, sel.to)
              void runRef.current(text)
              return true
            }
            return false
          },
        }),
      ),
    [],
  )

  /** Schema-аас autocomplete-ийн толь үүсгэнэ. */
  const schemaMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const t of tables) {
      map[t.name] = t.columns.map((c) => c.name)
    }
    return map
  }, [tables])

  const extensions = useMemo(
    () =>
      dbKind === 'mongodb'
        ? [javascript({ jsx: false }), runKeymap]
        : [
            sql({
              dialect: dbKind === 'postgres' ? PostgreSQL : MySQL,
              schema: schemaMap,
              upperCaseKeywords: true,
            }),
            runKeymap,
          ],
    [dbKind, schemaMap, runKeymap],
  )

  // `key` солигдсоны дараа editor-т фокус буцаана — ингэснээр
  // хэрэглэгч шууд бичиж эхлэх боломжтой.
  useEffect(() => {
    const view = editorRef.current?.view
    if (view) view.focus()
  }, [resetKey])

  /** Editor-ийн бодит текстийг уншина (сонголт байвал зөвхөн түүнийг). */
  const readEditor = (): string => {
    const view = editorRef.current?.view
    if (!view) return value
    const sel = view.state.selection.main
    return sel.empty ? view.state.doc.toString() : view.state.sliceDoc(sel.from, sel.to)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-alt)] px-3 py-1.5">
        <span className="text-xs text-[var(--text-dim)]">
          {dbKind === 'mongodb' ? (
            <>
              Mongo shell — <span className="font-mono">db.collection.find(&#123;&#125;)</span>
            </>
          ) : (
            <>
              {dbKind === 'postgres' ? 'PostgreSQL' : 'MySQL'} —{' '}
              <span className="font-mono">Ctrl/⌘ + Enter</span> ажиллуулна
            </>
          )}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]/60">
          {dbKind}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <CodeMirror
          /*
           * `key` нь ЧУХАЛ: @uiw/react-codemirror нь `value` prop
           * гаднаас өөрчлөгдөхөд editor-ийн агуулгыг шинэчлэхгүй
           * (зөвхөн хэрэглэгчийн бичсэн текстийг л мэднэ). Database
           * эсвэл domain солигдоход editor-ийг бүхэлд нь дахин
           * үүсгэхийн тулд key-г сольно.
           */
          key={`${dbKind}-${resetKey}`}
          ref={editorRef}
          value={value}
          onChange={onChange}
          height="100%"
          extensions={extensions}
          theme="dark"
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightActiveLine: true,
            foldGutter: false,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            indentOnInput: true,
          }}
          placeholder={
            dbKind === 'mongodb'
              ? 'db.books.find({ price: { $gt: 30000 } }).sort({ price: -1 }).limit(10)'
              : 'SELECT * FROM books LIMIT 10;'
          }
        />
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-alt)] px-3 py-2">
        <button
          type="button"
          disabled={running}
          onClick={() => void runQuery(readEditor())}
          className="flex items-center gap-1.5 rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[#0d1117] transition hover:brightness-110 disabled:opacity-50"
        >
          {running ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Ажиллаж байна...
            </>
          ) : (
            <>
              <Play size={13} />
              Ажиллуулах
            </>
          )}
        </button>

        <button
          type="button"
          disabled={running}
          onClick={() => onChange('')}
          className="flex items-center gap-1.5 rounded border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)] disabled:opacity-50"
        >
          <RotateCcw size={13} />
          Цэвэрлэх
        </button>

        <span className="ml-auto font-mono text-[10px] text-[var(--text-dim)]/60">
          {value.split('\n').length} мөр
        </span>
      </div>
    </div>
  )
}
