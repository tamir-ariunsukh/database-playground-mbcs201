import type { Metadata } from 'next'
import './globals.css'
import { DbProvider } from '@/components/DbProvider'

export const metadata: Metadata = {
  title: 'Database Playground — MBCS201',
  description:
    'PostgreSQL, MySQL, MongoDB гэсэн 3 өгөгдлийн сангийн асуулгыг browser дотор ажиллуулж үзэх интерактив орчин.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn">
      <body>
        <DbProvider>{children}</DbProvider>
      </body>
    </html>
  )
}
