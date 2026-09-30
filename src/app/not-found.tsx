import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
      <p className="font-mono text-5xl font-semibold text-[var(--text-dim)]/30">404</p>
      <h1 className="text-lg font-medium text-[var(--text)]">Хуудас олдсонгүй</h1>
      <p className="max-w-sm text-center text-sm leading-relaxed text-[var(--text-dim)]">
        Энэ хаягт хуудас байхгүй байна.
      </p>
      <Link
        href="/playground"
        className="mt-2 rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#0d1117] transition hover:brightness-110"
      >
        Playground руу очих
      </Link>
    </div>
  )
}
