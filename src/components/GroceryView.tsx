import { useMemo, useState } from 'react'
import { money, moneyExact } from '../engine/money'
import { useMealFlow } from '../store/useMealFlow'
import type { GroceryCategory } from '../types/mealflow'
import { Button } from './ui/Button'
import { Card } from './ui/Card'

const CATEGORIES: GroceryCategory[] = ['Produce', 'Meat', 'Dairy', 'Pantry']

export function GroceryView() {
  const { grocery, plan, openPlan } = useMealFlow()
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  const progress = useMemo(() => {
    if (!grocery) return 0
    const buyable = CATEGORIES.flatMap((category) =>
      grocery.groups[category].filter((line) => !line.coveredByPantry),
    )
    if (buyable.length === 0) return 100
    const done = buyable.filter((line) => checked[`${line.category}-${line.name}`]).length
    return Math.round((done / buyable.length) * 100)
  }, [checked, grocery])

  if (!grocery || !plan) return null

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage">Smart grocery list</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Combined shopping list
      </h1>
      <p className="mt-2 max-w-xl text-ink-soft">
        Quantities are merged across the week, grouped by aisle, and reduced by what you already have.
      </p>

      <Card className="mt-5 grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
        <Metric label="List estimate" value={money(grocery.estimatedCost)} />
        <Metric label="Items to buy" value={String(grocery.itemCount)} />
        <Metric label="Pantry savings" value={money(grocery.pantrySavings)} />
        <Metric label="Checked off" value={`${progress}%`} />
      </Card>

      <div className="mt-5 space-y-5">
        {CATEGORIES.map((category) => {
          const lines = grocery.groups[category]
          if (lines.length === 0) return null
          return (
            <section key={category}>
              <h2 className="mb-2 font-display text-xl font-semibold">{category}</h2>
              <ul className="space-y-2">
                {lines.map((line) => {
                  const key = `${line.category}-${line.name}`
                  const on = Boolean(checked[key])
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setChecked((current) => ({ ...current, [key]: !on }))}
                        className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm ${
                          line.coveredByPantry
                            ? 'border-dashed border-sand bg-mist text-ink-soft'
                            : on
                              ? 'border-sage/30 bg-white text-ink-soft line-through'
                              : 'border-sand bg-white'
                        }`}
                      >
                        <span>
                          <span className="font-medium">{line.name}</span>
                          <span className="ml-2 text-ink-soft">
                            {line.coveredByPantry
                              ? 'Covered by pantry'
                              : `${line.quantity} ${line.unit}`}
                          </span>
                        </span>
                        {!line.coveredByPantry && (
                          <span className="font-medium">{moneyExact(line.estimatedCost)}</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      <div className="mt-6">
        <Button variant="secondary" onClick={openPlan}>
          Back to meal plan
        </Button>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="font-display text-2xl font-semibold">{value}</p>
    </div>
  )
}
