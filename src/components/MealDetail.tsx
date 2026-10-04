import { getRecipe, SLOT_LABEL } from '../data/recipes'
import { alternativesFor } from '../engine/plan'
import { moneyExact } from '../engine/money'
import type { PlannedMeal, PlannerPrefs } from '../types/mealflow'
import { Button } from './ui/Button'

export function MealDetail({
  meal,
  prefs,
  onClose,
  onSwap,
}: {
  meal: PlannedMeal
  prefs: PlannerPrefs
  onClose: () => void
  onSwap: (recipeId: string) => void
}) {
  const recipe = getRecipe(meal.recipeId)
  const factor = meal.servings / recipe.baseServings
  const alternatives = alternativesFor(recipe.id, prefs)

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-cream p-5 sm:rounded-3xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-sage">
          {meal.dayLabel} · {SLOT_LABEL[meal.slot]}
        </p>
        <h2 className="mt-1 font-display text-3xl font-semibold">{recipe.name}</h2>
        <p className="mt-2 text-ink-soft">{recipe.description}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <Stat label="Servings" value={String(meal.servings)} />
          <Stat label="Time" value={`${recipe.cookMinutes} min`} />
          <Stat label="Cost" value={moneyExact(meal.estimatedCost)} />
        </div>
        <h3 className="mt-6 text-sm font-semibold">Nutrition per serving</h3>
        <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
          <Stat label="kcal" value={String(recipe.nutritionPerServing.calories)} />
          <Stat label="protein" value={`${recipe.nutritionPerServing.protein}g`} />
          <Stat label="carbs" value={`${recipe.nutritionPerServing.carbs}g`} />
          <Stat label="fat" value={`${recipe.nutritionPerServing.fat}g`} />
        </div>
        <h3 className="mt-6 text-sm font-semibold">Ingredients</h3>
        <ul className="mt-2 space-y-1.5 text-sm">
          {recipe.ingredients.map((ingredient) => (
            <li key={ingredient.name} className="flex justify-between gap-3">
              <span>{ingredient.name}</span>
              <span className="text-ink-soft">
                {formatQty(ingredient.quantity * factor, ingredient.unit)}
              </span>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 text-sm font-semibold">Method</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-ink-soft">
          {recipe.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {recipe.swapNote && (
          <p className="mt-4 rounded-2xl bg-white px-3 py-2 text-sm text-ink-soft">{recipe.swapNote}</p>
        )}
        {alternatives.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-semibold">Alternatives / replacements</h3>
            <div className="mt-2 space-y-2">
              {alternatives.map((alt) => (
                <button
                  key={alt.id}
                  type="button"
                  onClick={() => onSwap(alt.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-sand bg-white px-3 py-3 text-left text-sm"
                >
                  <span>
                    <span className="block font-medium">{alt.name}</span>
                    <span className="text-ink-soft">{alt.cookMinutes} min</span>
                  </span>
                  <span className="font-semibold text-sage">Use this</span>
                </button>
              ))}
            </div>
          </>
        )}
        <Button className="mt-6 w-full" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-2 py-3">
      <p className="font-semibold">{value}</p>
      <p className="text-ink-soft">{label}</p>
    </div>
  )
}

function formatQty(quantity: number, unit: string): string {
  const rounded =
    unit === 'pcs' || unit === 'cloves' || unit === 'slices'
      ? Math.max(1, Math.round(quantity * 10) / 10)
      : Math.round(quantity)
  return `${rounded} ${unit}`
}
