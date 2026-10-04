import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-3xl border border-sand bg-white p-4 shadow-[0_10px_30px_-18px_rgba(26,23,20,0.45)] ${className}`}
    >
      {children}
    </div>
  )
}
