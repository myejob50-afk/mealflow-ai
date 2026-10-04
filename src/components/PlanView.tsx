import { useMemo, useState } from 'react'
import { getRecipe, SLOT_LABEL, slotsForMealsPerDay } from '../data/recipes'
import { money, moneyExact } from '../engine/money'
import { useMealFlow } from '../store/useMealFlow'
import type { PlannedMeal } from '../types/mealflow'
import { MealDetail } from './MealDetail'
import { Button } from './ui/Button'
import { Card } from './ui/Card'

export function PlanView() {
  const { plan, prefs, optimize, openGrocery, startOver, replaceMeal } = useMealFlow()
  const [selected, setSelected] = useState<number | null>(null)

  const grouped = useMemo(() => {
    if (!plan) return []
    const days = new Map<string, PlannedMeal[]>()
    for (const meal of plan.meals) {
      const list = days.get(meal.date) ?? []
      list.push(meal)
      days.set(meal.date, list)
    }
    return [...days.entries()]
  }, [plan])

  if (!plan) return null
  const selectedMeal = selected === null ? null : plan.meals[selected]
  const weeklyBudget = prefs.budget
  const remaining = weeklyBudget - plan.estimatedCost
  const over = remaining < 0
  const usedPct = Math.min(100, (plan.estimatedCost / Math.max(weeklyBudget, 1)) * 100)
  const insufficient = weeklyBudget + 0.01 < plan.suggestedMinBudget
  const shortfall = Math.max(0, plan.suggestedMinBudget - weeklyBudget)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage">This week</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            7-day meal plan
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={startOver}>
            Edit inputs
          </Button>
          <Button onClick={optimize}>Optimize</Button>
        </div>
      </div>

      <Card className="mt-5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-ink-soft">Weekly shopping estimate</p>
            <p className="font-display text-3xl font-semibold">{money(plan.estimatedCost)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-ink-soft">Weekly budget {money(weeklyBudget)}</p>
            <p className={`font-semibold ${over ? 'text-danger' : 'text-sage'}`}>
              {over ? `${money(Math.abs(remaining))} over` : `${money(Math.max(0, remaining))} remaining`}
            </p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand">
          <div
            className={`h-full rounded-full ${over ? 'bg-terra' : 'bg-sage'}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        {insufficient && (
          <p className="mt-3 text-sm font-semibold text-danger">
            This weekly budget is not enough. A realistic minimum for these inputs is{' '}
            {money(plan.suggestedMinBudget)}. You are {money(shortfall)} short.
          </p>
        )}
        {plan.notes.map((note) => (
          <p key={note} className="mt-2 text-sm text-ink-soft">
            {note}
          </p>
        ))}
        {plan.lastOptimization && plan.lastOptimization.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {plan.lastOptimization.map((change) => (
              <li key={`${change.dayLabel}-${change.slot}-${change.toName}`} className="text-sage-dark">
                {change.dayLabel} {SLOT_LABEL[change.slot]}: {change.fromName} → {change.toName}.{' '}
                {change.reason}.
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-5 space-y-4">
        {grouped.map(([date, meals]) => (
          <section key={date}>
            <h2 className="mb-2 text-sm font-semibold text-ink-soft">{meals[0].dayLabel}</h2>
            <div className={`grid gap-3 ${slotsForMealsPerDay(prefs.mealsPerDay).length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              {meals.map((meal) => {
                const recipe = getRecipe(meal.recipeId)
                const index = plan.meals.findIndex(
                  (item) => item.date === meal.date && item.slot === meal.slot,
                )
                return (
                  <button
                    key={`${meal.date}-${meal.slot}`}
                    type="button"
                    onClick={() => setSelected(index)}
                    className="rounded-3xl border border-sand bg-white p-4 text-left shadow-[0_10px_30px_-18px_rgba(26,23,20,0.45)]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-sage">
                      {SLOT_LABEL[meal.slot]} · {recipe.cookMinutes} min
                    </p>
                    <p className="mt-1 font-display text-xl font-semibold leading-tight">
                      {recipe.name}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{recipe.description}</p>
                    <p className="mt-3 text-sm font-medium">
                      {meal.servings} servings · {moneyExact(meal.estimatedCost)} ·{' '}
                      {recipe.nutritionPerServing.calories} kcal
                    </p>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button className="sm:flex-1" onClick={openGrocery}>
          Open shopping list
        </Button>
        <Button className="sm:flex-1" variant="secondary" onClick={optimize}>
          Optimize budget & waste
        </Button>
      </div>

      {selectedMeal && selected !== null && (
        <MealDetail
          meal={selectedMeal}
          prefs={plan.prefs}
          onClose={() => setSelected(null)}
          onSwap={(recipeId) => {
            replaceMeal(selected, recipeId)
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}
