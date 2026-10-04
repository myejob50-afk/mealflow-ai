export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sage text-cream shadow-sm">
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden>
          <path
            d="M8 20c0-5 3.2-8 8-8s8 3 8 8"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path d="M7 21.5h18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="16" cy="11" r="2.1" fill="#E8C56B" />
        </svg>
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block font-display text-lg font-semibold tracking-tight text-ink">
            MealFlow AI
          </span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-ink-soft">
            Family meal planning
          </span>
        </span>
      )}
    </div>
  )
}
