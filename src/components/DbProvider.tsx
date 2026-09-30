'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import { DOMAINS } from '@/lib/schema'
import type { DomainDefinition } from '@/lib/schema/types'
import {
  execute,
  getTableMeta,
  loadDomain as loadDomainEngine,
  resetCurrentDomain,
} from '@/lib/engines'
import type { DbKind, QueryResult, TableMeta } from '@/lib/types'
import { QueryError } from '@/lib/types'

/**
 * DbProvider — бүх UI-ийн төлөвийг удирдана.
 *
 * Ажиллагаа:
 *   1. Хэрэглэгч domain сонгоно → 3 engine-д ижил schema + дата бэлдэнэ
 *   2. Хэрэглэгч database сонгоно (Postgres / MySQL / MongoDB)
 *   3. Query бичиж ажиллуулна → үр дүн grid-д гарна
 *   4. Reset → дата анхны байдалд буцна
 *
 * Бүх зүйл client-side. Сервер рүү ямар ч хүсэлт явахгүй.
 */

export interface HistoryEntry {
  id: string
  dbKind: DbKind
  query: string
  at: number
  success: boolean
  rowCount?: number
  durationMs?: number
  error?: string
}

interface State {
  domainId: string
  dbKind: DbKind
  loading: boolean
  loadingMessage: string
  error: string | null
  tables: TableMeta[]
  result: QueryResult | null
  queryError: QueryError | null
  running: boolean
  history: HistoryEntry[]
}

type Action =
  | { type: 'loading'; message: string }
  | { type: 'loaded'; tables: TableMeta[] }
  | { type: 'loadFailed'; error: string }
  | { type: 'setDomain'; domainId: string }
  | { type: 'setDb'; dbKind: DbKind }
  | { type: 'runStart' }
  | { type: 'runOk'; result: QueryResult; entry: HistoryEntry }
  | { type: 'runFail'; error: QueryError; entry: HistoryEntry }
  | { type: 'clearResult' }

const initialState: State = {
  domainId: 'library',
  dbKind: 'postgres',
  loading: true,
  loadingMessage: 'PostgreSQL engine ачаалж байна...',
  error: null,
  tables: [],
  result: null,
  queryError: null,
  running: false,
  history: [],
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true, loadingMessage: action.message, error: null }
    case 'loaded':
      return { ...state, loading: false, tables: action.tables, error: null }
    case 'loadFailed':
      return { ...state, loading: false, error: action.error }
    case 'setDomain':
      return { ...state, domainId: action.domainId, result: null, queryError: null }
    case 'setDb':
      return { ...state, dbKind: action.dbKind }
    case 'runStart':
      return { ...state, running: true, queryError: null }
    case 'runOk':
      return {
        ...state,
        running: false,
        result: action.result,
        queryError: null,
        history: [action.entry, ...state.history].slice(0, 50),
      }
    case 'runFail':
      return {
        ...state,
        running: false,
        result: null,
        queryError: action.error,
        history: [action.entry, ...state.history].slice(0, 50),
      }
    case 'clearResult':
      return { ...state, result: null, queryError: null }
    default:
      return state
  }
}

interface DbContextValue extends State {
  domain: DomainDefinition
  domains: DomainDefinition[]
  selectDomain: (id: string) => void
  selectDb: (kind: DbKind) => void
  runQuery: (query: string) => Promise<void>
  reset: () => Promise<void>
  setError: (msg: string | null) => void
}

const DbContext = createContext<DbContextValue | null>(null)

export function DbProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const domain = useMemo(
    () => DOMAINS.find((d) => d.id === state.domainId) ?? DOMAINS[0],
    [state.domainId],
  )

  /*
   * Domain ачаалах.
   *
   * ⚠️ React StrictMode (development) нь effect-ийг ХОЁР удаа дууддаг
   * (mount → unmount → mount). Хэрэв бид эхний дуудалтыг `cancelled`
   * болговол, хоёр дахь нь engine-ийг ДАХИН ачаалж, "relation already
   * exists" алдаа гарна.
   *
   * Шийдэл: `cancelled` нь зөвхөн STATE шинэчлэхийг хязгаарлана —
   * engine-ийн ачааллыг зогсоохгүй. `loadDomain` нь өөрөө lock-той
   * (engines/index.ts), тиймээс давхар дуудалт аюулгүй.
   *
   * Мөн `loadedDomainRef` нь ижил domain аль хэдийн ачаалагдсан бол
   * дахин ачаалахгүй — ингэснээр дата дэмий устгагдахгүй.
   */
  const loadedDomainRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Аль хэдийн ачаалагдсан domain — дахин ачаалахгүй.
      if (loadedDomainRef.current === domain.id) return

      dispatch({ type: 'loading', message: 'PostgreSQL engine ачаалж байна...' })
      try {
        const snapshot = await loadDomainEngine(domain.id)
        loadedDomainRef.current = domain.id
        if (cancelled) return
        dispatch({ type: 'loaded', tables: snapshot.tables })
      } catch (err) {
        if (cancelled) return
        dispatch({
          type: 'loadFailed',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [domain.id])

  const runQuery = useCallback(
    async (query: string) => {
      const trimmed = query.trim()
      if (!trimmed) return

      dispatch({ type: 'runStart' })
      const at = Date.now()

      try {
        const result = await execute(state.dbKind, trimmed)
        dispatch({
          type: 'runOk',
          result,
          entry: {
            id: `${at}-${Math.random().toString(36).slice(2, 7)}`,
            dbKind: state.dbKind,
            query: trimmed,
            at,
            success: true,
            rowCount: result.rowCount,
            durationMs: result.durationMs,
          },
        })
        // DDL/DML хийсэн бол schema-г дахин уншина (row count өөрчлөгдсөн).
        if (isMutating(trimmed)) {
          void refreshTables()
        }
      } catch (err) {
        const qErr =
          err instanceof QueryError
            ? err
            : new QueryError(
                err instanceof Error ? err.message : String(err),
                state.dbKind,
              )
        dispatch({
          type: 'runFail',
          error: qErr,
          entry: {
            id: `${at}-${Math.random().toString(36).slice(2, 7)}`,
            dbKind: state.dbKind,
            query: trimmed,
            at,
            success: false,
            error: qErr.message,
          },
        })
      }
    },
    [state.dbKind, domain.id],
  )

  const refreshTables = useCallback(async () => {
    try {
      // ⚠️ `loadDomain`-ийг ДАХИН дуудахгүй — тэр нь бүх датаг
      // устгаж, seed-ийг дахин ачаална. Хэрэглэгч INSERT/UPDATE
      // хийсний дараа тэр өөрчлөлт устах ёсгүй.
      // Зөвхөн schema-гийн мета өгөгдлийг (мөрийн тоо) шинэчилнэ.
      const tables = await getTableMeta()
      dispatch({ type: 'loaded', tables })
    } catch {
      // Чимээгүй алгасна — хэрэглэгчийн query аль хэдийн ажилласан.
    }
  }, [])

  const reset = useCallback(async () => {
    dispatch({ type: 'loading', message: 'Дата сэргээж байна...' })
    try {
      const snapshot = await resetCurrentDomain()
      // Reset нь датаг бүрэн сэргээсэн — ref-д тэмдэглэнэ.
      loadedDomainRef.current = snapshot.domainId
      dispatch({ type: 'loaded', tables: snapshot.tables })
      dispatch({ type: 'clearResult' })
    } catch (err) {
      dispatch({
        type: 'loadFailed',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, [])

  const selectDomain = useCallback((id: string) => dispatch({ type: 'setDomain', domainId: id }), [])
  const selectDb = useCallback((kind: DbKind) => dispatch({ type: 'setDb', dbKind: kind }), [])
  const setError = useCallback((msg: string | null) => {
    if (msg === null) dispatch({ type: 'clearResult' })
    else dispatch({ type: 'loadFailed', error: msg })
  }, [])

  const value: DbContextValue = {
    ...state,
    domain,
    domains: DOMAINS,
    selectDomain,
    selectDb,
    runQuery,
    reset,
    setError,
  }

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>
}

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext)
  if (!ctx) throw new Error('useDb нь DbProvider дотор л ашиглагдана.')
  return ctx
}

/** Query нь schema-г өөрчлөх эсэхийг шалгана. */
function isMutating(sql: string): boolean {
  return /^\s*(insert|update|delete|create|drop|alter|truncate)\b/i.test(sql)
}

export { DOMAINS }
