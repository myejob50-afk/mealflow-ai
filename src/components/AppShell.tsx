import type { ReactNode } from 'react'
import { useMealFlow } from '../store/useMealFlow'
import { WIZARD_STEPS } from '../store/persistence'
import { Logo } from './Logo'

export function AppShell({ children }: { children: ReactNode }) {
  const { screen, openPlan, openGrocery, startOver, plan } = useMealFlow()

  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col px-4 pb-24 pt-5 sm:px-6 lg:pb-10">
      <header className="mb-6 flex items-center justify-between gap-3">
        <button type="button" onClick={startOver} className="text-left">
          <Logo />
        </button>
        {plan && (
          <nav className="hidden items-center gap-1 rounded-full border border-sand bg-white p-1 text-sm font-semibold sm:flex">
            <button
              type="button"
              onClick={openPlan}
              className={`rounded-full px-3 py-1.5 ${screen === 'plan' ? 'bg-sage text-white' : 'text-ink-soft'}`}
            >
              Meal plan
            </button>
            <button
              type="button"
              onClick={openGrocery}
              className={`rounded-full px-3 py-1.5 ${screen === 'grocery' ? 'bg-sage text-white' : 'text-ink-soft'}`}
            >
              Shopping list
            </button>
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      {plan && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-sand bg-cream/95 p-3 backdrop-blur sm:hidden">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-2">
            <button
              type="button"
              onClick={openPlan}
              className={`rounded-2xl py-3 text-sm font-semibold ${screen === 'plan' ? 'bg-sage text-white' : 'bg-white text-ink'}`}
            >
              7-day plan
            </button>
            <button
              type="button"
              onClick={openGrocery}
              className={`rounded-2xl py-3 text-sm font-semibold ${screen === 'grocery' ? 'bg-sage text-white' : 'bg-white text-ink'}`}
            >
              Grocery list
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}

export function Stepper() {
  const { wizardStep, setWizardStep } = useMealFlow()
  const current = WIZARD_STEPS.findIndex((step) => step.id === wizardStep)

  return (
    <ol className="mb-6 flex gap-1 overflow-x-auto pb-1">
      {WIZARD_STEPS.map((step, index) => {
        const active = index === current
        const done = index < current
        return (
          <li key={step.id} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setWizardStep(step.id)}
              className="w-full text-left"
            >
              <span
                className={`mb-1.5 block h-1.5 rounded-full ${
                  active || done ? 'bg-sage' : 'bg-sand'
                }`}
              />
              <span
                className={`hidden truncate text-[11px] font-semibold uppercase tracking-wide sm:block ${
                  active ? 'text-sage' : 'text-ink-soft'
                }`}
              >
                {step.label}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
