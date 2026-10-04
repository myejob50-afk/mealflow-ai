import { namesMatch } from '../src/engine/normalize'
import { buildGroceryList, generatePlan } from '../src/engine/plan'
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

function lineNamed(grocery: ReturnType<typeof buildGroceryList>, name: string) {
  return Object.values(grocery.groups)
    .flat()
    .filter((line) => namesMatch(line.name, name))
}

assert(namesMatch('Garlic', 'garlic'), 'Garlic should match garlic')
assert(namesMatch('GARLIC', 'Garlic'), 'Garlic matching must be case-insensitive')
assert(namesMatch('Eggs', 'egg'), 'Eggs should match singular egg')
assert(namesMatch('egg', 'Eggs'), 'egg should match Eggs')
assert(namesMatch('Soy sauce', 'soy sauce'), 'Soy sauce should match ignoring case')
assert(namesMatch('Soy sauce', 'soy sauces'), 'Soy sauce should tolerate plural')
assert(!namesMatch('Milk', 'Oat milk'), 'Milk must not match oat milk')
assert(!namesMatch('Garlic', 'Garlic powder'), 'Garlic must not match garlic powder')

const chipPantry = generatePlan({
  ...base,
  pantry: [
    { name: 'Garlic', quantity: 4, unit: 'cloves' },
    { name: 'Eggs', quantity: 4, unit: 'pcs' },
    { name: 'Soy sauce', quantity: 400, unit: 'ml' },
  ],
})
const chipList = buildGroceryList(chipPantry)

for (const name of ['Garlic', 'Eggs', 'Soy sauce']) {
  const lines = lineNamed(chipList, name)
  assert(lines.length > 0, `${name} must appear in the weekly ingredient list`)
  assert(
    lines.every((line) => line.coveredByPantry && line.quantity === 0 && line.estimatedCost === 0),
    `${name} must be covered by pantry, not sold as 30 cloves / 17 eggs`,
  )
}

assert(chipList.pantrySavings > 2, `Pantry savings should exceed $2, got ${chipList.pantrySavings}`)
assert(
  Math.abs(chipList.estimatedCost - chipPantry.estimatedCost) < 0.05,
  'Shopping estimate must match pantry-adjusted grocery total',
)
assert(chipList.estimatedCost + chipList.pantrySavings > chipList.estimatedCost, 'Savings must reduce the buy total')

const mixedCase = generatePlan({
  ...base,
  pantry: [
    { name: 'garlic', quantity: 4, unit: 'cloves' },
    { name: 'EGG', quantity: 4, unit: 'pcs' },
    { name: 'SOY SAUCE', quantity: 400, unit: 'ml' },
  ],
})
const mixedList = buildGroceryList(mixedCase)
for (const name of ['Garlic', 'Eggs', 'Soy sauce']) {
  const lines = lineNamed(mixedList, name)
  assert(
    lines.every((line) => line.coveredByPantry),
    `${name} must match pantry even when casing/plural differs`,
  )
}

const limitedGarlic = generatePlan({
  ...base,
  pantry: [{ name: 'Garlic', quantity: 10, unit: 'cloves' }],
})
const limitedList = buildGroceryList(limitedGarlic)
const garlic = lineNamed(limitedList, 'Garlic')
assert(garlic.length === 1, 'Expected one garlic grocery line')
assert(!garlic[0].coveredByPantry, '10 cloves should not cover a full week of garlic')
assert(garlic[0].quantity > 0, 'Remaining garlic must stay on the shopping list')
assert(garlic[0].estimatedCost > 0, 'Remaining garlic must keep a buy cost')

console.log('pantry tests ok', {
  savings: Math.round(chipList.pantrySavings),
  shop: Math.round(chipList.estimatedCost),
  garlicRemaining: garlic[0].quantity,
})
