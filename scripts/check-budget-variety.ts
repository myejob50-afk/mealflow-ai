import { getRecipe } from '../src/data/recipes'
import { namesMatch } from '../src/engine/normalize'
import {
  applyWizardBudget,
  buildGroceryList,
  generatePlan,
  optimizePlan,
  suggestedMinimumBudget,
  swapMeal,
} from '../src/engine/plan'
import type { PlannerPrefs } from '../src/types/mealflow'
import { loadState, saveState } from '../src/store/persistence'

const scenario: PlannerPrefs = {
  budget: 40,
  people: 4,
  mealsPerDay: 3,
  cookMinutesMax: 40,
  diet: 'omnivore',
  allergies: [],
  excludedFoods: [],
  pantry: [
    { name: 'Garlic', quantity: 4, unit: 'cloves' },
    { name: 'Eggs', quantity: 4, unit: 'pcs' },
    { name: 'Soy sauce', quantity: 400, unit: 'ml' },
  ],
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function consecutiveRepeats(meals: { date: string; slot: string; recipeId: string }[]) {
  let count = 0
  const bySlot = new Map<string, typeof meals>()
  for (const meal of meals) {
    const list = bySlot.get(meal.slot) ?? []
    list.push(meal)
    bySlot.set(meal.slot, list)
  }
  for (const list of bySlot.values()) {
    const ordered = [...list].sort((a, b) => a.date.localeCompare(b.date))
    for (let i = 1; i < ordered.length; i += 1) {
      if (ordered[i].recipeId === ordered[i - 1].recipeId) count += 1
    }
  }
  return count
}

const minBudget = suggestedMinimumBudget(scenario)
assert(minBudget > 40, `Realistic minimum should be well above $40, got ${minBudget}`)

const halalForty: PlannerPrefs = {
  ...scenario,
  diet: 'halal',
  cookMinutesMax: 40,
}
const halalMin = suggestedMinimumBudget(halalForty)
const halalMinNoPantry = suggestedMinimumBudget({ ...halalForty, pantry: [] })
const halalMinTwoPeople = suggestedMinimumBudget({ ...halalForty, people: 2 })
const halalMinOneMeal = suggestedMinimumBudget({ ...halalForty, mealsPerDay: 1 })
assert(halalMin < halalMinNoPantry, 'Pantry must lower the feasible weekly minimum')
assert(halalMinTwoPeople < halalMin, 'Smaller household must have a lower feasible minimum')
assert(halalMinOneMeal < halalMin, 'Fewer meals per day must have a lower feasible minimum')
assert(halalMin !== 140 || halalMinNoPantry !== 140, 'Feasible minimum must not be a hardcoded $140')
assert(halalForty.budget === 40, 'Selected budget must stay $40 while computing the minimum')

const overBudgetPlan = generatePlan(scenario)
assert(overBudgetPlan.prefs.budget === 40, 'Generated plan must display the selected $40 weekly budget')
assert(
  overBudgetPlan.prefs.budget !== 150 && overBudgetPlan.prefs.budget !== 160,
  'Must not replace $40 with $150 or $160',
)
assert(
  Math.abs(overBudgetPlan.remaining - (40 - overBudgetPlan.estimatedCost)) < 0.01,
  'Grocery remaining must be calculated against $40',
)
assert(overBudgetPlan.budgetStatus === 'insufficient', '$40 plan should be marked insufficient, not rewritten')

const halalPlan = generatePlan(halalForty)
assert(halalPlan.prefs.budget === 40, 'Halal $40 must stay $40 on the generated plan')
assert(halalPlan.prefs.budget !== 150 && halalPlan.prefs.budget !== 160, 'Halal plan must not use a suggested minimum as the budget')
assert(halalPlan.suggestedMinBudget === halalMin, 'Plan must report the catalog-based feasible minimum')
assert(
  Math.abs(halalPlan.estimatedCost - halalPlan.suggestedMinBudget) > 1,
  'Realistic minimum must not be copied from the generated plan cost',
)
assert(halalPlan.budgetStatus === 'insufficient', '$40 Halal plan must warn that the weekly budget is not enough')
assert(halalPlan.estimatedCost > 40, '$40 must stay below the shopping estimate')
assert(
  Math.abs(halalPlan.remaining - (40 - halalPlan.estimatedCost)) < 0.01,
  'Halal remaining must be $40 minus the shopping estimate',
)
const optimizedHalal = optimizePlan(halalPlan)
assert(optimizedHalal.prefs.budget === 40, 'Optimize must keep the selected $40 budget')
assert(
  optimizedHalal.estimatedCost <= halalPlan.estimatedCost + 0.05,
  'Optimize must not raise the shopping estimate',
)
assert(consecutiveRepeats(optimizedHalal.meals) === 0, 'Optimize must keep non-repeating variety')

const ladder: { budget: number; plan: ReturnType<typeof generatePlan> }[] = []
for (const budget of [40, 100, 120, 140, 160]) {
  const plan = generatePlan({ ...halalForty, budget })
  ladder.push({ budget, plan })
  assert(plan.prefs.budget === budget, `Selected $${budget} must be preserved`)
  assert(plan.suggestedMinBudget === halalMin, `Feasible minimum must stay $${halalMin} at budget $${budget}`)
  if (budget + 0.01 < halalMin) {
    assert(
      plan.estimatedCost > plan.suggestedMinBudget + 0.5,
      `Minimum must not be the generated plan cost at $${budget}`,
    )
  }
  const list = buildGroceryList(plan)
  assert(Math.abs(list.estimatedCost - plan.estimatedCost) < 0.05, `Shopping estimate must match the grocery list at $${budget}`)
  assert(consecutiveRepeats(plan.meals) === 0, `No consecutive repeats at $${budget}`)
  const uniqueCount = new Set(plan.meals.map((meal) => meal.recipeId)).size
  const counts = new Map<string, number>()
  for (const meal of plan.meals) {
    counts.set(meal.recipeId, (counts.get(meal.recipeId) ?? 0) + 1)
  }
  const maxFreq = counts.size === 0 ? 0 : Math.max(...counts.values())
  if (budget + 0.01 < halalMin) {
    assert(uniqueCount >= 15, `Keep high recipe variety at $${budget}`)
  } else if (budget >= 120) {
    assert(uniqueCount >= 18, `Keep high recipe variety at $${budget}, got ${uniqueCount}`)
    assert(maxFreq <= 2, `No recipe should appear more than twice at $${budget}`)
  } else {
    assert(uniqueCount >= 10, `Keep recipe variety at $${budget}`)
    assert(maxFreq <= 2, `No recipe should appear more than twice at $${budget}`)
  }
  assert(plan.wasteScore >= 0 && plan.wasteScore <= 100, `Waste score out of range at $${budget}`)
  if (budget + 0.01 < halalMin) {
    assert(plan.budgetStatus === 'insufficient', `$${budget} is below the feasible minimum and must warn`)
    assert(plan.estimatedCost > budget, `$${budget} must not pretend the week fits`)
  } else {
    assert(plan.budgetStatus !== 'insufficient', `Do not warn when $${budget} covers the feasible minimum`)
    if (budget >= 120) {
      assert(uniqueCount >= 18, `Keep high recipe variety at $${budget}, got ${uniqueCount}`)
      assert(maxFreq <= 2, `No recipe should appear more than twice at $${budget}`)
      const optimized = optimizePlan(plan)
      const optCounts = new Map<string, number>()
      for (const meal of optimized.meals) {
        optCounts.set(meal.recipeId, (optCounts.get(meal.recipeId) ?? 0) + 1)
      }
      const optMax = Math.max(...optCounts.values())
      const optUnique = optCounts.size
      assert(optUnique >= 18, `Optimize must keep high variety at $${budget}, got ${optUnique}`)
      assert(optMax <= 2, `Optimize must not repeat a recipe more than twice at $${budget}`)
      assert(
        optimized.estimatedCost <= plan.estimatedCost + 0.05,
        `Optimize must not raise cost at $${budget}`,
      )
      assert(
        optimized.estimatedCost <= budget + 8,
        `Optimized $${budget} week must stay close to budget, got ${optimized.estimatedCost}`,
      )
      if (plan.estimatedCost > budget + 0.05) {
        assert(
          optimized.estimatedCost + 0.05 < plan.estimatedCost,
          `Optimize must actually cut shopping cost at $${budget}`,
        )
      }
    }
  }
}

const overForOptimize = generatePlan({ ...halalForty, budget: Math.max(160, halalMin + 40) })
let expensiveHalal = overForOptimize
const halalDinnerIndexes = overForOptimize.meals
  .map((meal, index) => ({ meal, index }))
  .filter(({ meal }) => meal.slot === 'dinner')
  .map(({ index }) => index)
for (const index of halalDinnerIndexes.slice(0, 3)) {
  const id = expensiveHalal.meals[index].recipeId
  expensiveHalal = swapMeal(expensiveHalal, index, id === 'baked-salmon' ? 'shrimp-garlic' : 'baked-salmon')
}
if (expensiveHalal.estimatedCost > overForOptimize.estimatedCost) {
  const optimizedFromOver = optimizePlan(expensiveHalal)
  assert(
    optimizedFromOver.estimatedCost < expensiveHalal.estimatedCost,
    'Optimize must change recipes and reduce shopping cost when the week is over budget',
  )
  assert(consecutiveRepeats(optimizedFromOver.meals) === 0, 'Optimize must preserve variety')
}

const excludedForty: PlannerPrefs = { ...halalForty, excludedFoods: ['Salmon', 'Shrimp'] }
const excludedPlan = generatePlan(excludedForty)
assert(excludedPlan.prefs.budget === 40, 'Excluded-food plan must keep $40')
const excludedGrocery = buildGroceryList(excludedPlan)
for (const meal of excludedPlan.meals) {
  const recipe = getRecipe(meal.recipeId)
  const blob = `${recipe.name} ${recipe.ingredients.map((item) => item.name).join(' ')}`.toLowerCase()
  assert(!blob.includes('salmon'), `${recipe.name} contains excluded salmon`)
  assert(!blob.includes('shrimp'), `${recipe.name} contains excluded shrimp`)
}
const shopNames = Object.values(excludedGrocery.groups)
  .flat()
  .map((line) => line.name.toLowerCase())
  .join(' ')
assert(!shopNames.includes('salmon'), 'Shopping list contains excluded salmon')
assert(!shopNames.includes('shrimp'), 'Shopping list contains excluded shrimp')

const affordable = generatePlan({ ...scenario, budget: 220 })
assert(affordable.prefs.budget === 220, 'Generated plan must keep the selected budget')
const synced = applyWizardBudget(affordable, 40)
assert(synced.prefs.budget === 40, 'applyWizardBudget must keep $40, not replace it with $160')
assert(synced.prefs.budget !== 160, 'Must not normalize $40 to $160')
assert(
  Math.abs(synced.remaining - (40 - synced.estimatedCost)) < 0.01,
  'Remaining must be computed from the selected $40 budget',
)
assert(affordable.meals.length === 21, 'Expected 7 days × 3 meals')
assert(affordable.estimatedCost <= 220, 'Affordable plan must stay within the weekly budget')
assert(consecutiveRepeats(affordable.meals) === 0, 'No consecutive-day recipe repeats')
assert(
  new Set(affordable.meals.map((meal) => meal.recipeId)).size >= 18,
  'Prefer unique recipes across the week',
)

for (const meal of affordable.meals) {
  assert(getRecipe(meal.recipeId).slot === meal.slot, `${meal.recipeId} placed in the wrong slot`)
}

const grocery = buildGroceryList(affordable)
assert(Math.abs(grocery.estimatedCost - affordable.estimatedCost) < 0.05, 'Totals must match')
for (const name of ['Garlic', 'Eggs', 'Soy sauce']) {
  const lines = Object.values(grocery.groups)
    .flat()
    .filter((line) => namesMatch(line.name, name))
  assert(lines.length > 0, `${name} should be in the grocery breakdown`)
  assert(
    lines.every((line) => line.coveredByPantry && line.estimatedCost === 0),
    `${name} pantry deduction must still apply`,
  )
}
assert(grocery.pantrySavings > 2, 'Pantry must still reduce shopping cost')

const variedHalal = generatePlan({ ...halalForty, budget: 220 })
assert(new Set(variedHalal.meals.map((meal) => meal.recipeId)).size >= 18, 'High-budget Halal week should keep variety')
const overOneTwenty = applyWizardBudget(variedHalal, 120)
assert(overOneTwenty.prefs.budget === 120, 'Budget overlay must stay $120')
assert(overOneTwenty.estimatedCost > 120, 'Setup: varied week should start over $120')
const optimizedOneTwenty = optimizePlan(overOneTwenty)
assert(
  optimizedOneTwenty.meals.some((meal, index) => meal.recipeId !== overOneTwenty.meals[index].recipeId),
  'Optimize must change meal selections, not only the displayed warning',
)
assert(optimizedOneTwenty.estimatedCost < overOneTwenty.estimatedCost, 'Optimize must lower the shopping estimate')
assert(
  (optimizedOneTwenty.lastOptimization?.length ?? 0) > 0,
  'Optimize must record recipe changes',
)
if (halalMin <= 120) {
  assert(
    optimizedOneTwenty.estimatedCost <= 120 + 8,
    `Optimize must stay close to $120 when the catalog minimum is $${halalMin}, got ${optimizedOneTwenty.estimatedCost}`,
  )
  assert(optimizedOneTwenty.budgetStatus !== 'insufficient', 'Do not warn after a successful in-budget optimize')
}
assert(consecutiveRepeats(optimizedOneTwenty.meals) === 0, 'Optimized $120 week must not repeat consecutively')
assert(
  new Set(optimizedOneTwenty.meals.map((meal) => meal.recipeId)).size >= 18,
  'Optimize must not collapse the week into duplicate meals just to cut cost',
)
const optimizedCounts = new Map<string, number>()
for (const meal of optimizedOneTwenty.meals) {
  optimizedCounts.set(meal.recipeId, (optimizedCounts.get(meal.recipeId) ?? 0) + 1)
}
assert(
  Math.max(...optimizedCounts.values()) <= 2,
  'Optimize must not use the same recipe more than twice to chase a cheaper week',
)
assert(
  Math.abs(buildGroceryList(optimizedOneTwenty).estimatedCost - optimizedOneTwenty.estimatedCost) < 0.05,
  'Optimized shopping estimate must match the grocery list',
)

const storage: Record<string, string> = {}
const memoryStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => {
    storage[key] = value
  },
  removeItem: (key: string) => {
    delete storage[key]
  },
}
;(globalThis as { localStorage: typeof memoryStorage }).localStorage = memoryStorage

saveState({
  prefs: { ...halalForty, budget: 40 },
  wizardStep: 'generate',
  screen: 'plan',
  plan: { ...affordable, prefs: { ...affordable.prefs, budget: 160 } },
})
const restored = loadState()
assert(restored?.prefs.budget === 40, 'Persisted wizard budget must stay $40')
assert(restored?.plan?.prefs.budget === 40, 'Load must not restore an old $160 plan budget over $40')

saveState({
  prefs: { ...halalForty, budget: 40 },
  wizardStep: 'generate',
  screen: 'plan',
  plan: {
    ...affordable,
    suggestedMinBudget: 150,
    prefs: { ...affordable.prefs, budget: 150 },
  },
})
const restoredMin = loadState()
assert(restoredMin?.prefs.budget === 40, 'Selected $40 must win over a stale $150 suggested minimum')
assert(restoredMin?.plan?.prefs.budget === 40, 'Plan snapshot must not keep $150 after a $40 selection')

let expensive = affordable
const dinnerIndexes = affordable.meals
  .map((meal, index) => ({ meal, index }))
  .filter(({ meal }) => meal.slot === 'dinner')
  .map(({ index }) => index)
for (const index of dinnerIndexes.slice(0, 3)) {
  if (expensive.meals[index].recipeId !== 'baked-salmon') {
    expensive = swapMeal(expensive, index, 'baked-salmon')
  } else {
    expensive = swapMeal(expensive, index, 'shrimp-garlic')
  }
}
assert(expensive.estimatedCost > affordable.estimatedCost, 'Setup: inflated dinners should cost more')

const optimized = optimizePlan(expensive)
assert(optimized.estimatedCost < expensive.estimatedCost, 'Optimize must reduce the grocery estimate')
assert(consecutiveRepeats(optimized.meals) === 0, 'Optimize must not create consecutive repeats')
assert(
  new Set(optimized.meals.map((meal) => meal.recipeId)).size >= 15,
  'Optimize must keep meaningful variety',
)
const optimizedGrocery = buildGroceryList(optimized)
for (const name of ['Garlic', 'Eggs', 'Soy sauce']) {
  const lines = Object.values(optimizedGrocery.groups)
    .flat()
    .filter((line) => namesMatch(line.name, name))
  assert(
    lines.every((line) => line.coveredByPantry),
    `${name} must remain covered after optimize`,
  )
}

console.log('budget/variety tests ok', {
  minBudget,
  halalMin,
  halalMinNoPantry,
  ladder: ladder.map(({ budget, plan }) => ({
    budget,
    cost: Math.round(plan.estimatedCost),
    min: plan.suggestedMinBudget,
    status: plan.budgetStatus,
    unique: new Set(plan.meals.map((meal) => meal.recipeId)).size,
  })),
  affordableCost: Math.round(affordable.estimatedCost),
  unique: new Set(affordable.meals.map((meal) => meal.recipeId)).size,
  inflated: Math.round(expensive.estimatedCost),
  optimized: Math.round(optimized.estimatedCost),
  pantrySavings: Math.round(grocery.pantrySavings),
})
