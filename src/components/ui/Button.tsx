import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const styles: Record<Variant, string> = {
  primary:
    'bg-sage text-white shadow-sm hover:bg-sage-dark disabled:bg-sand disabled:text-ink-soft',
  secondary:
    'bg-white text-ink border border-sand hover:border-sage/40 hover:bg-mist disabled:opacity-50',
  ghost: 'bg-transparent text-ink-soft hover:text-ink hover:bg-white/70',
  danger: 'bg-terra text-white hover:bg-terra/90',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
