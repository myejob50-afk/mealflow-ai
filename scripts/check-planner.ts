import {
  buildGroceryList,
  generatePlan,
  optimizePlan,
  suggestedMinimumBudget,
} from '../src/engine/plan'
import { getRecipe } from '../src/data/recipes'
import type { PlannerPrefs } from '../src/types/mealflow'

const base: PlannerPrefs = {
  budget: 220,
  people: 4,
  mealsPerDay: 3,
  cookMinutesMax: 40,
  diet: 'omnivore',
  allergies: [],
  excludedFoods: [],
  pantry: [],
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const tight = { ...base, budget: 40 }
const tightPlan = generatePlan(tight)
assert(tightPlan.prefs.budget === 40, 'Tight plan must keep the selected $40 weekly budget')
assert(tightPlan.prefs.budget !== 150 && tightPlan.prefs.budget !== 160, 'Must not replace $40 with a suggested minimum')
assert(tightPlan.remaining === 40 - tightPlan.estimatedCost, 'Remaining must be $40 minus the shopping estimate')
assert(tightPlan.remaining < 0, '$40 should still show as over budget')
assert(suggestedMinimumBudget(tight) >= 80, 'Minimum weekly budget should be well above $40')
console.log('tight plan kept $40; estimate', Math.round(tightPlan.estimatedCost), 'remaining', Math.round(tightPlan.remaining))

const plan = generatePlan(base)
const waste = plan.wasteScore
assert(waste >= 0 && waste <= 100, `Waste score out of range: ${waste}`)

const byDaySlot = new Map<string, string[]>()
for (const meal of plan.meals) {
  const recipe = getRecipe(meal.recipeId)
  assert(recipe.slot === meal.slot, `${recipe.name} is ${recipe.slot} but placed in ${meal.slot}`)
  const list = byDaySlot.get(meal.slot) ?? []
  list.push(meal.recipeId)
  byDaySlot.set(meal.slot, list)
}

for (const [slot, ids] of byDaySlot) {
  for (let i = 1; i < ids.length; i += 1) {
    assert(ids[i] !== ids[i - 1], `Consecutive ${slot} repeat: ${ids[i]}`)
  }
  const unique = new Set(ids)
  assert(unique.size >= Math.min(5, ids.length), `${slot} variety too low: ${unique.size}`)
}

const grocery = buildGroceryList(plan)
assert(
  Math.abs(grocery.estimatedCost - plan.estimatedCost) < 0.05,
  'Plan cost should match shopping list',
)

const withPantry = generatePlan({
  ...base,
  pantry: [
    { name: 'Rice', quantity: 2000, unit: 'g' },
    { name: 'Olive oil', quantity: 500, unit: 'ml' },
    { name: 'Onion', quantity: 10, unit: 'pcs' },
    { name: 'Garlic', quantity: 20, unit: 'cloves' },
    { name: 'Canned tomatoes', quantity: 2000, unit: 'g' },
  ],
})
assert(
  withPantry.estimatedCost < plan.estimatedCost,
  `Pantry should reduce shop (${withPantry.estimatedCost} vs ${plan.estimatedCost})`,
)
assert(buildGroceryList(withPantry).pantrySavings > 0, 'Pantry savings should be > 0')

const selectedPantry = generatePlan({
  ...base,
  pantry: [
    { name: 'Garlic', quantity: 0, unit: 'cloves' },
    { name: 'Eggs', quantity: 0, unit: 'pcs' },
    { name: 'Soy sauce', quantity: 0, unit: 'ml' },
  ],
})
const selectedList = buildGroceryList(selectedPantry)
for (const name of ['Garlic', 'Eggs', 'Soy sauce']) {
  const lines = Object.values(selectedList.groups)
    .flat()
    .filter((line) => line.name === name)
  assert(lines.length > 0, `${name} should still appear as a pantry-covered line`)
  assert(
    lines.every((line) => line.coveredByPantry && line.estimatedCost === 0 && line.quantity === 0),
    `${name} must be fully covered by pantry, not sold as a shopping item`,
  )
}
assert(selectedList.pantrySavings > 2, `Pantry savings too low: ${selectedList.pantrySavings}`)
assert(
  selectedList.estimatedCost < selectedPantry.prefs.budget,
  'Grocery total should be recalculated after pantry deductions',
)
assert(
  Math.abs(selectedList.estimatedCost - selectedPantry.estimatedCost) < 0.05,
  'Plan total must match grocery total after pantry',
)

const optimized = optimizePlan(plan)
assert(optimized.wasteScore >= 0 && optimized.wasteScore <= 100, 'Optimized waste invalid')
assert(
  optimized.estimatedCost < plan.estimatedCost - 0.5 || (optimized.lastOptimization?.length ?? 0) > 0,
  `Optimize should change the plan or cut cost (${optimized.estimatedCost} vs ${plan.estimatedCost})`,
)
assert(
  new Set(optimized.meals.map((meal) => meal.recipeId)).size >= 12,
  'Optimize removed too much variety',
)

console.log('ok', {
  meals: plan.meals.length,
  unique: new Set(plan.meals.map((meal) => meal.recipeId)).size,
  cost: Math.round(plan.estimatedCost),
  waste: plan.wasteScore,
  pantryCost: Math.round(withPantry.estimatedCost),
  pantrySavings: Math.round(buildGroceryList(withPantry).pantrySavings),
  optimizeCost: Math.round(optimized.estimatedCost),
  optimizeChanges: optimized.lastOptimization?.length ?? 0,
})
