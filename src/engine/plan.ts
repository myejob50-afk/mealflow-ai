import { getRecipe, RECIPE_BY_ID, RECIPES, slotsForMealsPerDay } from '../data/recipes'
import type {
  GroceryCategory,
  GroceryLine,
  GroceryList,
  MealPlan,
  MealSlot,
  PantryItem,
  PlanChange,
  PlannedMeal,
  PlannerPrefs,
  Recipe,
} from '../types/mealflow'
import { namesMatch, normalizeName } from './normalize'

function scaleFactor(recipe: Recipe, people: number): number {
  return people / recipe.baseServings
}

export function recipeCost(recipe: Recipe, people: number): number {
  const factor = scaleFactor(recipe, people)
  return recipe.ingredients.reduce(
    (sum, item) => sum + item.quantity * item.unitCost * factor,
    0,
  )
}

function recipeUsesPantry(recipe: Recipe, pantry: PantryItem[]): number {
  if (pantry.length === 0) return 0
  return recipe.ingredients.filter((ingredient) =>
    pantry.some((item) => namesMatch(item.name, ingredient.name)),
  ).length
}

function mentionsExcluded(recipe: Recipe, excluded: string[]): boolean {
  return excluded.some((term) => {
    const needle = normalizeName(term)
    if (!needle) return false
    if (normalizeName(recipe.name).includes(needle)) return true
    return recipe.ingredients.some((ingredient) => {
      const name = normalizeName(ingredient.name)
      return namesMatch(ingredient.name, term) || name.includes(needle)
    })
  })
}

export function isRecipeCompatible(recipe: Recipe, prefs: PlannerPrefs): boolean {
  if (recipe.cookMinutes > prefs.cookMinutesMax) return false
  if (!recipe.diets.includes(prefs.diet)) return false
  if (recipe.allergens.some((allergen) => prefs.allergies.includes(allergen))) return false
  if (mentionsExcluded(recipe, prefs.excludedFoods)) return false
  return true
}

function compatiblePool(prefs: PlannerPrefs, slot: MealSlot): Recipe[] {
  return RECIPES.filter((recipe) => recipe.slot === slot && isRecipeCompatible(recipe, prefs))
}

function hashSeed(prefs: PlannerPrefs): number {
  const key = JSON.stringify(prefs)
  let hash = 2166136261
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createRng(seed: number): () => number {
  let state = seed || 1
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function weekDates(from = new Date()): { date: string; dayLabel: string }[] {
  const days: { date: string; dayLabel: string }[] = []
  for (let i = 0; i < 7; i += 1) {
    const next = new Date(from)
    next.setDate(from.getDate() + i)
    days.push({
      date: next.toISOString().slice(0, 10),
      dayLabel: next.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    })
  }
  return days
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundQty(quantity: number, unit: string): number {
  if (unit === 'pcs' || unit === 'cloves' || unit === 'slices') {
    return Math.max(0, Math.ceil(quantity - 0.05))
  }
  if (quantity <= 0) return 0
  if (quantity >= 100) return Math.round(quantity / 5) * 5
  if (quantity >= 10) return Math.round(quantity * 2) / 2
  return Math.round(quantity * 10) / 10
}

function pantryStock(item: PantryItem): number {
  const quantity = item.quantity
  if (quantity == null || Number.isNaN(quantity) || quantity <= 0) {
    return Number.POSITIVE_INFINITY
  }
  const unit = normalizeName(item.unit)
  const countable =
    unit === 'pcs' || unit === 'pc' || unit === 'cloves' || unit === 'clove' || unit === 'slices'
  const bulk = unit === 'g' || unit === 'ml'
  // Chip/custom add never collected a real amount; 4 / 400 / 1 are UI placeholders.
  if ((countable && (quantity === 1 || quantity === 4)) || (bulk && quantity === 400)) {
    return Number.POSITIVE_INFINITY
  }
  return quantity
}

function groceryFromMeals(meals: PlannedMeal[], pantry: PantryItem[]): GroceryList {
  const combined = new Map<
    string,
    {
      name: string
      unit: string
      category: GroceryCategory
      quantity: number
      cost: number
    }
  >()

  for (const meal of meals) {
    const recipe = getRecipe(meal.recipeId)
    const factor = scaleFactor(recipe, meal.servings)
    for (const ingredient of recipe.ingredients) {
      const key = `${normalizeName(ingredient.name)}|${ingredient.unit}`
      const current = combined.get(key)
      const addQty = ingredient.quantity * factor
      const addCost = addQty * ingredient.unitCost
      if (current) {
        current.quantity += addQty
        current.cost += addCost
      } else {
        combined.set(key, {
          name: ingredient.name,
          unit: ingredient.unit,
          category: ingredient.category,
          quantity: addQty,
          cost: addCost,
        })
      }
    }
  }

  const groups: GroceryList['groups'] = {
    Produce: [],
    Meat: [],
    Dairy: [],
    Pantry: [],
  }

  let grossCost = 0
  for (const item of combined.values()) {
    grossCost += item.cost
    const pantryMatch = pantry.find((entry) => namesMatch(entry.name, item.name))
    let buyQty = item.quantity
    let covered = false
    if (pantryMatch) {
      const stock = pantryStock(pantryMatch)
      buyQty = Math.max(0, item.quantity - stock)
      covered = buyQty <= 0.05 * item.quantity
    }
    const ratio = item.quantity === 0 ? 0 : buyQty / item.quantity
    const line: GroceryLine = {
      name: item.name,
      quantity: covered ? 0 : roundQty(buyQty, item.unit),
      unit: item.unit,
      category: item.category,
      estimatedCost: covered ? 0 : item.cost * ratio,
      coveredByPantry: covered,
    }
    groups[item.category].push(line)
  }

  const categories: GroceryCategory[] = ['Produce', 'Meat', 'Dairy', 'Pantry']
  let estimatedCost = 0
  let itemCount = 0
  for (const category of categories) {
    groups[category].sort((a, b) => a.name.localeCompare(b.name))
    estimatedCost += groups[category].reduce((sum, line) => sum + line.estimatedCost, 0)
    itemCount += groups[category].filter((line) => !line.coveredByPantry).length
  }

  return {
    groups,
    estimatedCost,
    itemCount,
    pantrySavings: Math.max(0, grossCost - estimatedCost),
  }
}

export function buildGroceryList(plan: MealPlan): GroceryList {
  return groceryFromMeals(plan.meals, plan.prefs.pantry)
}

function shoppingCost(meals: PlannedMeal[], prefs: PlannerPrefs): number {
  return groceryFromMeals(meals, prefs.pantry).estimatedCost
}

function wasteScore(meals: PlannedMeal[], grocery: GroceryList): number {
  const unique = new Set<string>()
  let total = 0
  for (const meal of meals) {
    const recipe = getRecipe(meal.recipeId)
    for (const ingredient of recipe.ingredients) {
      unique.add(normalizeName(ingredient.name))
      total += 1
    }
  }
  const reuse = total <= 1 ? 1 : 1 - unique.size / total
  const gross = grocery.estimatedCost + grocery.pantrySavings
  const pantryRelief = gross <= 0 ? 0 : grocery.pantrySavings / gross
  return clamp(Math.round(reuse * 75 + pantryRelief * 25), 0, 100)
}

function uniqueRecipeCount(meals: PlannedMeal[]): number {
  return new Set(meals.map((meal) => meal.recipeId)).size
}

function consecutiveRepeatCount(meals: PlannedMeal[]): number {
  let count = 0
  const bySlot = new Map<MealSlot, PlannedMeal[]>()
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

function neighborId(
  meals: PlannedMeal[],
  index: number,
  direction: -1 | 1,
): string | undefined {
  const current = meals[index]
  const targetTime = new Date(`${current.date}T12:00:00`).getTime() + direction * 86400000
  const targetDate = new Date(targetTime).toISOString().slice(0, 10)
  return meals.find((meal) => meal.slot === current.slot && meal.date === targetDate)?.recipeId
}

function usageAfterSwap(meals: PlannedMeal[], index: number, recipeId: string): number {
  return meals.reduce((count, meal, i) => {
    const id = i === index ? recipeId : meal.recipeId
    return count + (id === recipeId ? 1 : 0)
  }, 0)
}

function slotDayCount(meals: PlannedMeal[], slot: MealSlot): number {
  return meals.filter((meal) => meal.slot === slot).length
}

function maxUsesForPool(poolSize: number, days: number): number {
  if (poolSize <= 0) return days
  return Math.max(1, Math.ceil(days / poolSize))
}

function hardUseCap(poolSize: number, days: number): number {
  return Math.max(maxUsesForPool(poolSize, days), poolSize < days ? maxUsesForPool(poolSize, days) : 2)
}

function unusedInSlotExist(
  meals: PlannedMeal[],
  index: number,
  candidateId: string,
  pool: Recipe[],
): boolean {
  const slot = meals[index].slot
  const used = new Set<string>()
  meals.forEach((meal, i) => {
    if (meal.slot !== slot) return
    used.add(i === index ? candidateId : meal.recipeId)
  })
  return pool.some((recipe) => !used.has(recipe.id))
}

function violatesHardVariety(
  meals: PlannedMeal[],
  index: number,
  recipeId: string,
  pool: Recipe[],
): boolean {
  if (pool.length <= 1) return false
  if (neighborId(meals, index, -1) === recipeId) return true
  if (neighborId(meals, index, 1) === recipeId) return true
  const uses = usageAfterSwap(meals, index, recipeId)
  const days = slotDayCount(meals, meals[index].slot)
  const cap = hardUseCap(pool.length, days)
  if (uses > cap) return true
  if (uses > 1 && unusedInSlotExist(meals, index, recipeId, pool)) return true
  return false
}

function maxFrequency(meals: PlannedMeal[]): number {
  const counts = new Map<string, number>()
  for (const meal of meals) {
    counts.set(meal.recipeId, (counts.get(meal.recipeId) ?? 0) + 1)
  }
  return counts.size === 0 ? 0 : Math.max(...counts.values())
}

function maxPossibleUnique(prefs: PlannerPrefs): number {
  const slots = slotsForMealsPerDay(prefs.mealsPerDay)
  return slots.reduce((sum, slot) => sum + Math.min(7, compatiblePool(prefs, slot).length), 0)
}

function makeMeal(
  day: { date: string; dayLabel: string },
  slot: MealSlot,
  recipe: Recipe,
  people: number,
): PlannedMeal {
  return {
    date: day.date,
    dayLabel: day.dayLabel,
    slot,
    recipeId: recipe.id,
    servings: people,
    estimatedCost: recipeCost(recipe, people),
  }
}

function pickRecipe(
  pool: Recipe[],
  prefs: PlannerPrefs,
  meals: PlannedMeal[],
  slot: MealSlot,
  previousId: string | undefined,
  mode: 'variety' | 'budget',
  rng: () => number,
): Recipe | null {
  if (pool.length === 0) return null

  const usedIds = meals.filter((meal) => meal.slot === slot).map((meal) => meal.recipeId)
  const usedCounts = new Map<string, number>()
  for (const id of usedIds) usedCounts.set(id, (usedCounts.get(id) ?? 0) + 1)
  const unused = pool.filter((recipe) => !usedCounts.has(recipe.id))
  const cap = hardUseCap(pool.length, 7)
  const underCap = pool.filter((recipe) => (usedCounts.get(recipe.id) ?? 0) < cap)
  const base = unused.length > 0 ? unused : underCap.length > 0 ? underCap : pool
  const notConsecutive = previousId ? base.filter((recipe) => recipe.id !== previousId) : base
  const candidates = notConsecutive.length > 0 ? notConsecutive : base

  let best = candidates[0]
  let bestScore = Number.NEGATIVE_INFINITY
  const currentShop = shoppingCost(meals, prefs)
  const alreadyPicked = meals.map((meal) => getRecipe(meal.recipeId))

  for (const recipe of candidates) {
    const trial = [
      ...meals,
      makeMeal({ date: 'trial', dayLabel: 'trial' }, slot, recipe, prefs.people),
    ]
    const nextShop = shoppingCost(trial, prefs)
    const delta = nextShop - currentShop
    const pantryHits = recipeUsesPantry(recipe, prefs.pantry)
    const share = alreadyPicked.reduce((sum, other) => sum + ingredientOverlap(other, recipe), 0)
    if (mode === 'budget') {
      const score = -delta * 12 + pantryHits * 0.5 + share * 0.2 + rng() * 0.05
      if (score > bestScore) {
        bestScore = score
        best = recipe
      }
      continue
    }
    const score = pantryHits * 2.2 + share * 1.1 + rng() * 2.8 - delta * 0.22
    if (score > bestScore) {
      bestScore = score
      best = recipe
    }
  }

  return best ?? null
}

function assembleMeals(prefs: PlannerPrefs, mode: 'variety' | 'budget', rng: () => number): PlannedMeal[] {
  const slots = slotsForMealsPerDay(prefs.mealsPerDay)
  const meals: PlannedMeal[] = []
  const lastBySlot: Partial<Record<MealSlot, string>> = {}

  for (const day of weekDates()) {
    for (const slot of slots) {
      const pool = compatiblePool(prefs, slot)
      const picked = pickRecipe(pool, prefs, meals, slot, lastBySlot[slot], mode, rng)
      if (!picked) {
        throw new Error(
          `Not enough ${slot} recipes match these filters. Relax cook time, allergies, or exclusions.`,
        )
      }
      lastBySlot[slot] = picked.id
      meals.push(makeMeal(day, slot, picked, prefs.people))
    }
  }

  return meals
}

function dummyWeekDays(): { date: string; dayLabel: string }[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = `2026-01-${String(index + 1).padStart(2, '0')}`
    return { date, dayLabel: `Day ${index + 1}` }
  })
}

function mealsFromChosen(
  chosen: Partial<Record<MealSlot, Recipe[]>>,
  slots: MealSlot[],
  people: number,
): PlannedMeal[] {
  const meals: PlannedMeal[] = []
  let n = 0
  for (const slot of slots) {
    for (const recipe of chosen[slot] ?? []) {
      meals.push(
        makeMeal({ date: `t${String(n).padStart(2, '0')}`, dayLabel: `t${n}` }, slot, recipe, people),
      )
      n += 1
    }
  }
  return meals
}

function scheduleVariedMeals(
  chosen: Partial<Record<MealSlot, Recipe[]>>,
  slots: MealSlot[],
  days: { date: string; dayLabel: string }[],
  people: number,
): PlannedMeal[] {
  const meals: PlannedMeal[] = []
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    for (const slot of slots) {
      const recipes = chosen[slot] ?? []
      const recipe = recipes[dayIndex] ?? recipes[recipes.length - 1]
      if (!recipe) continue
      meals.push(makeMeal(days[dayIndex], slot, recipe, people))
    }
  }
  return meals
}

function applyWeekDates(meals: PlannedMeal[], days = weekDates()): PlannedMeal[] {
  const oldDates = [...new Set(meals.map((meal) => meal.date))].sort()
  return meals.map((meal) => {
    const day = days[oldDates.indexOf(meal.date)] ?? days[0]
    return { ...meal, date: day.date, dayLabel: day.dayLabel }
  })
}

function improveVariedWeek(meals: PlannedMeal[], prefs: PlannerPrefs): PlannedMeal[] {
  let current = [...meals]
  for (let pass = 0; pass < 36; pass += 1) {
    const currentCost = shoppingCost(current, prefs)
    let best:
      | { index: number; recipe: Recipe; cost: number }
      | null = null
    for (let index = 0; index < current.length; index += 1) {
      const pool = compatiblePool(prefs, current[index].slot)
      for (const candidate of pool) {
        if (candidate.id === current[index].recipeId) continue
        if (violatesHardVariety(current, index, candidate.id, pool)) continue
        const next = current.map((meal, i) =>
          i === index
            ? {
                ...meal,
                recipeId: candidate.id,
                estimatedCost: recipeCost(candidate, prefs.people),
              }
            : meal,
        )
        if (consecutiveRepeatCount(next) > consecutiveRepeatCount(current)) continue
        const cost = shoppingCost(next, prefs)
        if (cost + 0.01 < (best?.cost ?? currentCost)) {
          best = { index, recipe: candidate, cost }
        }
      }
    }
    if (!best) break
    const meal = current[best.index]
    current[best.index] = {
      ...meal,
      recipeId: best.recipe.id,
      estimatedCost: recipeCost(best.recipe, prefs.people),
    }
  }
  return current
}

function buildCheapestVariedMeals(
  prefs: PlannerPrefs,
  days: { date: string; dayLabel: string }[] = dummyWeekDays(),
): PlannedMeal[] {
  const slots = slotsForMealsPerDay(prefs.mealsPerDay)
  const pools: Partial<Record<MealSlot, Recipe[]>> = {}
  const chosen: Partial<Record<MealSlot, Recipe[]>> = {}
  for (const slot of slots) {
    const pool = compatiblePool(prefs, slot)
    if (pool.length === 0) {
      throw new Error(
        `Not enough ${slot} recipes match these filters. Relax cook time, allergies, or exclusions.`,
      )
    }
    pools[slot] = pool
    chosen[slot] = []
  }

  const needed = 7 * slots.length
  for (let step = 0; step < needed; step += 1) {
    let best: { slot: MealSlot; recipe: Recipe; cost: number } | null = null
    for (const slot of slots) {
      if ((chosen[slot]?.length ?? 0) >= 7) continue
      const pool = pools[slot] ?? []
      const picked = chosen[slot] ?? []
      const unused = pool.filter((recipe) => !picked.some((item) => item.id === recipe.id))
      const cap = hardUseCap(pool.length, 7)
      const underCap = pool.filter(
        (recipe) => picked.filter((item) => item.id === recipe.id).length < cap,
      )
      const candidates = unused.length > 0 ? unused : underCap.length > 0 ? underCap : pool
      for (const recipe of candidates) {
        const trial = { ...chosen, [slot]: [...picked, recipe] }
        const cost = shoppingCost(mealsFromChosen(trial, slots, prefs.people), prefs)
        if (!best || cost + 1e-9 < best.cost) {
          best = { slot, recipe, cost }
        }
      }
    }
    if (!best) break
    chosen[best.slot] = [...(chosen[best.slot] ?? []), best.recipe]
  }

  return improveVariedWeek(scheduleVariedMeals(chosen, slots, days, prefs.people), prefs)
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k <= 0) return [[]]
  if (k > items.length) return []
  const result: T[][] = []
  const walk = (start: number, acc: T[]) => {
    if (acc.length === k) {
      result.push([...acc])
      return
    }
    for (let i = start; i <= items.length - (k - acc.length); i += 1) {
      acc.push(items[i])
      walk(i + 1, acc)
      acc.pop()
    }
  }
  walk(0, [])
  return result
}

function product<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>(
    (acc, list) => acc.flatMap((prefix) => list.map((item) => [...prefix, item])),
    [[]],
  )
}

function rankedForCost(pool: Recipe[], prefs: PlannerPrefs): Recipe[] {
  return [...pool].sort((a, b) => {
    const pantry = recipeUsesPantry(b, prefs.pantry) - recipeUsesPantry(a, prefs.pantry)
    if (pantry !== 0) return pantry
    return recipeCost(a, prefs.people) - recipeCost(b, prefs.people)
  })
}

function rotateForDays(recipes: Recipe[], days: number): Recipe[] {
  return Array.from({ length: days }, (_, index) => recipes[index % recipes.length])
}

function slotDistinctCount(meals: PlannedMeal[], slot: MealSlot): number {
  return new Set(meals.filter((meal) => meal.slot === slot).map((meal) => meal.recipeId)).size
}

function isValidCostPlan(meals: PlannedMeal[], prefs: PlannerPrefs): boolean {
  const slots = slotsForMealsPerDay(prefs.mealsPerDay)
  if (meals.length !== 7 * slots.length) return false
  if (consecutiveRepeatCount(meals) > 0) {
    return slots.every((slot) => compatiblePool(prefs, slot).length <= 1)
  }
  for (const meal of meals) {
    if (!isRecipeCompatible(getRecipe(meal.recipeId), prefs)) return false
  }
  for (const slot of slots) {
    const poolSize = compatiblePool(prefs, slot).length
    if (slotDistinctCount(meals, slot) < Math.min(2, poolSize)) return false
  }
  return true
}

function assembleLowCostValidMeals(
  prefs: PlannerPrefs,
  days: { date: string; dayLabel: string }[],
  rng: () => number,
): PlannedMeal[] {
  const slots = slotsForMealsPerDay(prefs.mealsPerDay)
  const meals: PlannedMeal[] = []
  const lastBySlot: Partial<Record<MealSlot, string>> = {}

  for (const day of days) {
    for (const slot of slots) {
      const pool = compatiblePool(prefs, slot)
      const previousId = lastBySlot[slot]
      const used = new Set(meals.filter((meal) => meal.slot === slot).map((meal) => meal.recipeId))
      const minDistinct = Math.min(2, pool.length)
      let candidates = previousId && pool.length > 1 ? pool.filter((recipe) => recipe.id !== previousId) : pool
      if (used.size < minDistinct) {
        const unused = candidates.filter((recipe) => !used.has(recipe.id))
        if (unused.length > 0) candidates = unused
      }
      let best = candidates[0]
      let bestCost = Number.POSITIVE_INFINITY
      for (const recipe of candidates) {
        const trial = [...meals, makeMeal(day, slot, recipe, prefs.people)]
        const cost = shoppingCost(trial, prefs) + rng() * 0.0001
        if (cost < bestCost) {
          bestCost = cost
          best = recipe
        }
      }
      if (!best) {
        throw new Error(
          `Not enough ${slot} recipes match these filters. Relax cook time, allergies, or exclusions.`,
        )
      }
      lastBySlot[slot] = best.id
      meals.push(makeMeal(day, slot, best, prefs.people))
    }
  }
  return meals
}

function considerCost(
  meals: PlannedMeal[],
  prefs: PlannerPrefs,
  best: { meals: PlannedMeal[]; cost: number } | null,
): { meals: PlannedMeal[]; cost: number } | null {
  const cost = shoppingCost(meals, prefs)
  if (!best || cost + 1e-9 < best.cost) return { meals, cost }
  return best
}

function improveValidCostWeek(meals: PlannedMeal[], prefs: PlannerPrefs): PlannedMeal[] {
  let current = [...meals]
  for (let pass = 0; pass < 8; pass += 1) {
    const currentCost = shoppingCost(current, prefs)
    let best: { index: number; recipe: Recipe; cost: number } | null = null
    for (let index = 0; index < current.length; index += 1) {
      const pool = compatiblePool(prefs, current[index].slot)
      for (const candidate of pool) {
        if (candidate.id === current[index].recipeId) continue
        const next = current.map((meal, i) =>
          i === index
            ? {
                ...meal,
                recipeId: candidate.id,
                estimatedCost: recipeCost(candidate, prefs.people),
              }
            : meal,
        )
        if (consecutiveRepeatCount(next) > 0) continue
        if (slotDistinctCount(next, current[index].slot) < Math.min(2, pool.length)) continue
        const cost = shoppingCost(next, prefs)
        if (cost + 0.01 < (best?.cost ?? currentCost)) {
          best = { index, recipe: candidate, cost }
        }
      }
    }
    if (!best) break
    const meal = current[best.index]
    current[best.index] = {
      ...meal,
      recipeId: best.recipe.id,
      estimatedCost: recipeCost(best.recipe, prefs.people),
    }
  }
  return current
}

function findLowestCostValidMeals(prefs: PlannerPrefs): PlannedMeal[] {
  const days = dummyWeekDays()
  const slots = slotsForMealsPerDay(prefs.mealsPerDay)
  const pools = slots.map((slot) => rankedForCost(compatiblePool(prefs, slot), prefs))
  if (pools.some((pool) => pool.length === 0)) {
    throw new Error('Not enough recipes match these filters. Relax cook time, allergies, or exclusions.')
  }

  let best: { meals: PlannedMeal[]; cost: number } | null = null

  const comboLists = pools.map((pool) => {
    const top = pool.slice(0, Math.min(5, pool.length))
    const pairs = combinations(top, Math.min(2, top.length))
    const triples = top.length >= 3 ? combinations(top.slice(0, 4), 3) : []
    return [...pairs, ...triples]
  })

  for (const combo of product(comboLists)) {
    const chosen: Partial<Record<MealSlot, Recipe[]>> = {}
    combo.forEach((recipes, index) => {
      chosen[slots[index]] = rotateForDays(recipes, 7)
    })
    best = considerCost(scheduleVariedMeals(chosen, slots, days, prefs.people), prefs, best)
  }

  for (let seed = 0; seed < 4; seed += 1) {
    const greedy = assembleLowCostValidMeals(prefs, days, createRng((seed + 1) * 0x9e3779b9))
    const improved = improveValidCostWeek(greedy, prefs)
    if (isValidCostPlan(improved, prefs)) {
      best = considerCost(improved, prefs, best)
    }
  }

  if (!best) {
    throw new Error('Could not build a valid weekly plan from the catalog.')
  }
  return best.meals
}

function constraintKey(prefs: PlannerPrefs): string {
  return JSON.stringify({
    people: prefs.people,
    mealsPerDay: prefs.mealsPerDay,
    cookMinutesMax: prefs.cookMinutesMax,
    diet: prefs.diet,
    allergies: prefs.allergies,
    excludedFoods: prefs.excludedFoods,
    pantry: prefs.pantry,
  })
}

let cachedMinKey = ''
let cachedMinCost = 0
let cachedMinMeals: PlannedMeal[] | null = null

function lowestCostValidMealsCached(prefs: PlannerPrefs): PlannedMeal[] {
  const key = constraintKey(prefs)
  if (key === cachedMinKey && cachedMinMeals) return cachedMinMeals
  const meals = findLowestCostValidMeals(prefs)
  cachedMinKey = key
  cachedMinMeals = meals
  cachedMinCost = shoppingCost(meals, prefs)
  return meals
}

export function estimateMinimumWeeklyCost(prefs: PlannerPrefs): number {
  lowestCostValidMealsCached(prefs)
  return cachedMinCost
}

export function suggestedMinimumBudget(prefs: PlannerPrefs): number {
  return Math.max(1, Math.ceil(estimateMinimumWeeklyCost(prefs) - 1e-9))
}

export class InsufficientBudgetError extends Error {
  readonly minBudget: number

  constructor(minBudget: number, prefs: PlannerPrefs) {
    const meals = prefs.mealsPerDay === 1 ? '1 meal' : `${prefs.mealsPerDay} meals`
    super(
      `A weekly grocery budget of $${prefs.budget} is too low for ${prefs.people} people eating ${meals} a day for 7 days. Even the cheapest matching plan still needs about $${minBudget}. Raise the weekly budget to at least $${minBudget} — this is not a daily budget.`,
    )
    this.name = 'InsufficientBudgetError'
    this.minBudget = minBudget
  }
}

function summarize(
  meals: PlannedMeal[],
  prefs: PlannerPrefs,
  suggestedMin?: number,
): Pick<
  MealPlan,
  'estimatedCost' | 'remaining' | 'wasteScore' | 'notes' | 'budgetStatus' | 'suggestedMinBudget'
> {
  const grocery = groceryFromMeals(meals, prefs.pantry)
  const estimatedCost = grocery.estimatedCost
  const remaining = prefs.budget - estimatedCost
  const score = wasteScore(meals, grocery)
  const minBudget = suggestedMin ?? suggestedMinimumBudget(prefs)
  const notes: string[] = []
  let budgetStatus: MealPlan['budgetStatus'] = 'ok'

  if (prefs.budget + 0.01 < minBudget) {
    budgetStatus = 'insufficient'
    const short = Math.max(0, Math.round(minBudget - prefs.budget))
    notes.push(
      `This weekly budget is not enough. A realistic minimum for these inputs is $${minBudget}. You are about $${short} short.`,
    )
  } else if (remaining < 0) {
    budgetStatus = 'tight'
    notes.push(
      'This shopping list is still a little over the weekly grocery budget. Optimize to reuse ingredients and cut cost while keeping variety.',
    )
  } else if (remaining < prefs.budget * 0.08) {
    budgetStatus = 'tight'
    notes.push('The weekly grocery budget is tight, with little left after pantry items are subtracted.')
  } else {
    notes.push('The shopping list stays within the weekly grocery budget after subtracting pantry items.')
  }

  if (grocery.pantrySavings > 0.5) {
    notes.push(
      `Pantry items cut about ${Math.round(grocery.pantrySavings)} from what you need to buy.`,
    )
  }

  const unique = uniqueRecipeCount(meals)
  notes.push(
    `${unique} different recipes this week · waste score ${score}/100 (100 = least waste).`,
  )

  return {
    estimatedCost,
    remaining,
    wasteScore: score,
    notes,
    budgetStatus,
    suggestedMinBudget: minBudget,
  }
}

function isAcceptableVariety(meals: PlannedMeal[], prefs: PlannerPrefs): boolean {
  const possible = maxPossibleUnique(prefs)
  const unique = uniqueRecipeCount(meals)
  if (unique < Math.min(possible, Math.max(18, Math.ceil(meals.length * 0.85)))) return false
  return maxFrequency(meals) <= 2
}

export function generatePlan(prefs: PlannerPrefs): MealPlan {
  const selectedBudget = prefs.budget
  const minBudget = suggestedMinimumBudget(prefs)
  const stamped = { ...prefs, budget: selectedBudget, pantry: [...prefs.pantry] }
  const days = weekDates()

  const rng = createRng(hashSeed(prefs))
  let meals = assembleMeals(stamped, 'variety', rng)
  let totals = summarize(meals, stamped, minBudget)

  if (selectedBudget + 0.01 >= minBudget && totals.estimatedCost > selectedBudget) {
    const cheapVaried = applyWeekDates(buildCheapestVariedMeals(stamped, dummyWeekDays()), days)
    if (
      isAcceptableVariety(cheapVaried, stamped) &&
      uniqueRecipeCount(cheapVaried) >= uniqueRecipeCount(meals) &&
      shoppingCost(cheapVaried, stamped) + 0.05 < totals.estimatedCost
    ) {
      meals = cheapVaried
    }
    totals = summarize(meals, stamped, minBudget)
  }

  return {
    id: `plan-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    prefs: stamped,
    meals,
    lastOptimization: [],
    ...totals,
  }
}

export function applyWizardBudget(plan: MealPlan, budget: number): MealPlan {
  return refreshPlanTotals({
    ...plan,
    prefs: { ...plan.prefs, budget },
  })
}

export function refreshPlanTotals(plan: MealPlan): MealPlan {
  return { ...plan, ...summarize(plan.meals, plan.prefs) }
}

export function swapMeal(plan: MealPlan, index: number, recipeId: string): MealPlan {
  const recipe = getRecipe(recipeId)
  const meals = plan.meals.map((meal, i) => {
    if (i !== index) return meal
    return {
      ...meal,
      recipeId: recipe.id,
      estimatedCost: recipeCost(recipe, plan.prefs.people),
    }
  })
  return {
    ...plan,
    meals,
    lastOptimization: [
      {
        dayLabel: plan.meals[index].dayLabel,
        slot: plan.meals[index].slot,
        fromName: getRecipe(plan.meals[index].recipeId).name,
        toName: recipe.name,
        reason: 'Manual swap',
      },
    ],
    ...summarize(meals, plan.prefs),
  }
}

function ingredientOverlap(a: Recipe, b: Recipe): number {
  const names = new Set(a.ingredients.map((item) => normalizeName(item.name)))
  return b.ingredients.filter((item) => names.has(normalizeName(item.name))).length
}

function weekOverlap(meals: PlannedMeal[], index: number, recipe: Recipe): number {
  return meals.reduce((sum, meal, i) => {
    if (i === index) return sum
    return sum + ingredientOverlap(getRecipe(meal.recipeId), recipe)
  }, 0)
}

function withRecipeAt(meals: PlannedMeal[], index: number, recipe: Recipe, people: number): PlannedMeal[] {
  return meals.map((meal, i) =>
    i === index
      ? {
          ...meal,
          recipeId: recipe.id,
          estimatedCost: recipeCost(recipe, people),
        }
      : meal,
  )
}

type CostSearchLimit = { maxUses: number; minUnique: number }

const OPTIMIZE_EVAL_LIMIT = 24000
const OPTIMIZE_SWAP_PASSES = 36
const OPTIMIZE_PAIR_PASSES = 8

function spendEval(counter: { n: number }): boolean {
  counter.n += 1
  return counter.n > OPTIMIZE_EVAL_LIMIT
}

function minimumUsesNeeded(prefs: PlannerPrefs): number {
  const slots = slotsForMealsPerDay(prefs.mealsPerDay)
  return slots.reduce((highest, slot) => {
    const poolSize = compatiblePool(prefs, slot).length
    if (poolSize === 0) return Math.max(highest, 7)
    return Math.max(highest, Math.ceil(7 / poolSize))
  }, 1)
}

function varietySteps(prefs: PlannerPrefs, mealCount: number): CostSearchLimit[] {
  const possible = Math.min(maxPossibleUnique(prefs), mealCount)
  const needed = minimumUsesNeeded(prefs)
  // Stay at the product variety bar: 18 different recipes when the catalog allows it,
  // and never more than two uses unless a slot has too few recipes to fill the week.
  return [{ maxUses: Math.max(2, needed), minUnique: Math.min(possible, 18) }]
}

function varietyOk(meals: PlannedMeal[], prefs: PlannerPrefs, step: CostSearchLimit): boolean {
  const slots = slotsForMealsPerDay(prefs.mealsPerDay)
  if (consecutiveRepeatCount(meals) > 0) {
    if (!slots.every((slot) => compatiblePool(prefs, slot).length <= 1)) return false
  }
  for (const meal of meals) {
    if (!isRecipeCompatible(getRecipe(meal.recipeId), prefs)) return false
  }
  const counts = new Map<string, number>()
  for (const meal of meals) counts.set(meal.recipeId, (counts.get(meal.recipeId) ?? 0) + 1)
  for (const count of counts.values()) {
    if (count > step.maxUses) return false
  }
  const possible = Math.min(maxPossibleUnique(prefs), meals.length)
  if (counts.size < Math.min(step.minUnique, possible)) return false
  for (const slot of slots) {
    const poolSize = compatiblePool(prefs, slot).length
    if (slotDistinctCount(meals, slot) < Math.min(2, poolSize)) return false
  }
  return true
}

const marginalShopCache = new Map<string, number>()

function marginalShopCost(recipe: Recipe, prefs: PlannerPrefs): number {
  const key = `${recipe.id}|${prefs.people}|${JSON.stringify(prefs.pantry)}`
  const cached = marginalShopCache.get(key)
  if (cached != null) return cached
  const cost = shoppingCost(
    [makeMeal({ date: '2000-01-01', dayLabel: 't' }, recipe.slot, recipe, prefs.people)],
    prefs,
  )
  marginalShopCache.set(key, cost)
  return cost
}

function rankByShopCost(pool: Recipe[], prefs: PlannerPrefs): Recipe[] {
  return [...pool].sort((a, b) => {
    const cost = marginalShopCost(a, prefs) - marginalShopCost(b, prefs)
    if (Math.abs(cost) > 0.01) return cost
    return recipeCost(a, prefs.people) - recipeCost(b, prefs.people)
  })
}

function setsForSlot(ranked: Recipe[], days: number, maxUses: number): Recipe[][] {
  const minUnique = Math.max(1, Math.ceil(days / Math.max(1, maxUses)))
  const maxUnique = Math.min(days, ranked.length)
  const sets: Recipe[][] = []
  const seen = new Set<string>()
  const add = (recipes: Recipe[]) => {
    if (recipes.length < minUnique || recipes.length > maxUnique) return
    const key = [...recipes].map((recipe) => recipe.id).sort().join('|')
    if (seen.has(key)) return
    seen.add(key)
    sets.push(recipes)
  }
  for (let unique = maxUnique; unique >= minUnique; unique -= 1) {
    const base = ranked.slice(0, unique)
    add(base)
    for (let offset = 0; offset < 2; offset += 1) {
      const replacement = ranked[unique + offset]
      if (!replacement || unique === 0) break
      add([...base.slice(0, -1), replacement])
    }
  }
  return sets
}

function placeWithoutConsecutive(
  recipes: Recipe[],
  days: number,
  maxUses: number,
  prefs: PlannerPrefs,
): Recipe[] | null {
  if (recipes.length === 0 || recipes.length > days || recipes.length * maxUses < days) return null
  const ranked = rankByShopCost(recipes, prefs)
  const left = new Map<string, number>()
  for (const recipe of recipes) left.set(recipe.id, 1)
  let extra = days - recipes.length
  for (const recipe of ranked) {
    if (extra <= 0) break
    const add = Math.min(maxUses - 1, extra)
    left.set(recipe.id, 1 + add)
    extra -= add
  }
  if (extra > 0) return null
  const order: Recipe[] = []
  for (let day = 0; day < days; day += 1) {
    const previousId = order[day - 1]?.id
    const options = recipes.filter((recipe) => (left.get(recipe.id) ?? 0) > 0 && recipe.id !== previousId)
    if (options.length === 0) return null
    options.sort((a, b) => {
      const remain = (left.get(b.id) ?? 0) - (left.get(a.id) ?? 0)
      if (remain !== 0) return remain
      return marginalShopCost(a, prefs) - marginalShopCost(b, prefs)
    })
    const pick = options[0]
    left.set(pick.id, (left.get(pick.id) ?? 1) - 1)
    order.push(pick)
  }
  return order
}

function applySlotSets(
  skeleton: PlannedMeal[],
  prefs: PlannerPrefs,
  slots: MealSlot[],
  sets: Recipe[][],
  maxUses: number,
): PlannedMeal[] | null {
  const meals = skeleton.map((meal) => ({ ...meal }))
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index]
    const indices = meals
      .map((meal, mealIndex) => ({ meal, mealIndex }))
      .filter(({ meal }) => meal.slot === slot)
      .sort((a, b) => a.meal.date.localeCompare(b.meal.date))
    const order = placeWithoutConsecutive(sets[index], indices.length, maxUses, prefs)
    if (!order || order.length !== indices.length) return null
    indices.forEach(({ mealIndex }, day) => {
      const recipe = order[day]
      meals[mealIndex] = {
        ...meals[mealIndex],
        recipeId: recipe.id,
        estimatedCost: recipeCost(recipe, prefs.people),
      }
    })
  }
  return meals
}

function buildLowCostWeek(
  skeleton: PlannedMeal[],
  prefs: PlannerPrefs,
  step: CostSearchLimit,
  counter: { n: number },
): PlannedMeal[] | null {
  const slots = slotsForMealsPerDay(prefs.mealsPerDay)
  const uniqueTarget = Math.min(step.minUnique, maxPossibleUnique(prefs), skeleton.length)
  const slotSets = slots.map((slot) => {
    const days = skeleton.filter((meal) => meal.slot === slot).length
    return setsForSlot(rankByShopCost(compatiblePool(prefs, slot), prefs), days, step.maxUses)
  })
  if (slotSets.some((sets) => sets.length === 0)) return null

  let best: PlannedMeal[] | null = null
  let bestCost = Number.POSITIVE_INFINITY
  let bestShare = -1

  const walk = (chosen: Recipe[][]) => {
    if (spendEval(counter)) return
    if (chosen.length === slots.length) {
      const unique = chosen.reduce((sum, set) => sum + set.length, 0)
      if (unique < uniqueTarget) return
      const meals = applySlotSets(skeleton, prefs, slots, chosen, step.maxUses)
      if (!meals || !varietyOk(meals, prefs, step)) return
      const cost = shoppingCost(meals, prefs)
      const share = meals.reduce(
        (sum, meal, index) => sum + weekOverlap(meals, index, getRecipe(meal.recipeId)),
        0,
      )
      if (cost < bestCost - 0.01 || (Math.abs(cost - bestCost) <= 0.01 && share > bestShare)) {
        best = meals
        bestCost = cost
        bestShare = share
      }
      return
    }
    const slotIndex = chosen.length
    const usedUnique = chosen.reduce((sum, set) => sum + set.length, 0)
    for (const set of slotSets[slotIndex]) {
      const maxAhead = slotSets
        .slice(slotIndex + 1)
        .reduce((sum, sets) => sum + sets.reduce((highest, item) => Math.max(highest, item.length), 0), 0)
      if (usedUnique + set.length + maxAhead < uniqueTarget) continue
      if (counter.n > OPTIMIZE_EVAL_LIMIT) return
      walk([...chosen, set])
    }
  }

  walk([])
  return best
}

function mealShare(meals: PlannedMeal[], index: number, recipe: Recipe): number {
  return weekOverlap(meals, index, recipe)
}

function improveBySwaps(
  start: PlannedMeal[],
  prefs: PlannerPrefs,
  step: CostSearchLimit,
  counter: { n: number },
): PlannedMeal[] {
  let current = start.map((meal) => ({ ...meal }))
  if (!varietyOk(current, prefs, step)) return current

  for (let pass = 0; pass < OPTIMIZE_SWAP_PASSES; pass += 1) {
    if (counter.n > OPTIMIZE_EVAL_LIMIT) break
    const currentCost = shoppingCost(current, prefs)
    if (currentCost <= prefs.budget) break
    let best: { index: number; recipe: Recipe; cost: number; share: number } | null = null
    for (let index = 0; index < current.length; index += 1) {
      const pool = compatiblePool(prefs, current[index].slot)
      for (const candidate of pool) {
        if (candidate.id === current[index].recipeId) continue
        if (spendEval(counter)) return current
        if (usageAfterSwap(current, index, candidate.id) > step.maxUses) continue
        if (
          (neighborId(current, index, -1) === candidate.id || neighborId(current, index, 1) === candidate.id) &&
          pool.length > 1
        ) {
          continue
        }
        const next = withRecipeAt(current, index, candidate, prefs.people)
        if (!varietyOk(next, prefs, step)) continue
        const cost = shoppingCost(next, prefs)
        const share = mealShare(next, index, candidate)
        if (cost + 0.01 >= currentCost) continue
        if (
          !best ||
          cost < best.cost - 0.01 ||
          (Math.abs(cost - best.cost) <= 0.01 && share > best.share)
        ) {
          best = { index, recipe: candidate, cost, share }
        }
      }
    }
    if (!best) break
    current = withRecipeAt(current, best.index, best.recipe, prefs.people)
  }

  for (let pass = 0; pass < OPTIMIZE_PAIR_PASSES; pass += 1) {
    if (counter.n > OPTIMIZE_EVAL_LIMIT) break
    const currentCost = shoppingCost(current, prefs)
    if (currentCost <= prefs.budget) break
    const expensive = current
      .map((meal, index) => ({ index, cost: recipeCost(getRecipe(meal.recipeId), prefs.people) }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 6)
      .map((item) => item.index)
    let best: { first: number; second: number; a: Recipe; b: Recipe; cost: number; share: number } | null =
      null
    for (let left = 0; left < expensive.length; left += 1) {
      for (let right = left + 1; right < expensive.length; right += 1) {
        const first = expensive[left]
        const second = expensive[right]
        const firstPool = compatiblePool(prefs, current[first].slot)
        const secondPool = compatiblePool(prefs, current[second].slot)
        for (const candidateA of firstPool) {
          if (candidateA.id === current[first].recipeId) continue
          for (const candidateB of secondPool) {
            if (candidateB.id === current[second].recipeId) continue
            if (spendEval(counter)) return current
            const next = withRecipeAt(
              withRecipeAt(current, first, candidateA, prefs.people),
              second,
              candidateB,
              prefs.people,
            )
            if (!varietyOk(next, prefs, step)) continue
            const cost = shoppingCost(next, prefs)
            if (cost + 0.01 >= currentCost) continue
            const share = mealShare(next, first, candidateA) + mealShare(next, second, candidateB)
            if (
              !best ||
              cost < best.cost - 0.01 ||
              (Math.abs(cost - best.cost) <= 0.01 && share > best.share)
            ) {
              best = { first, second, a: candidateA, b: candidateB, cost, share }
            }
          }
        }
      }
    }
    if (!best) break
    current = withRecipeAt(
      withRecipeAt(current, best.first, best.a, prefs.people),
      best.second,
      best.b,
      prefs.people,
    )
  }

  return current
}

function searchCheaperWeek(start: PlannedMeal[], prefs: PlannerPrefs): PlannedMeal[] {
  let bestMeals = start.map((meal) => ({ ...meal }))
  let bestCost = shoppingCost(bestMeals, prefs)
  if (bestCost <= prefs.budget) return bestMeals
  const counter = { n: 0 }

  for (const step of varietySteps(prefs, start.length)) {
    if (counter.n > OPTIMIZE_EVAL_LIMIT) break
    const starts = [bestMeals]
    const seed = buildLowCostWeek(start, prefs, step, counter)
    if (seed) starts.push(seed)
    for (const candidate of starts) {
      const climbed = improveBySwaps(candidate, prefs, step, counter)
      if (!varietyOk(climbed, prefs, step)) continue
      const cost = shoppingCost(climbed, prefs)
      if (cost + 0.01 < bestCost) {
        bestMeals = climbed
        bestCost = cost
      }
      if (bestCost <= prefs.budget) return bestMeals
    }
  }

  return bestMeals
}

function describeMealChanges(before: PlannedMeal[], after: PlannedMeal[], prefs: PlannerPrefs): PlanChange[] {
  const changes: PlanChange[] = []
  let running = before
  for (let index = 0; index < after.length; index += 1) {
    if (before[index]?.recipeId === after[index]?.recipeId) continue
    const recipe = getRecipe(after[index].recipeId)
    const next = withRecipeAt(running, index, recipe, prefs.people)
    const saved = shoppingCost(running, prefs) - shoppingCost(next, prefs)
    changes.push({
      dayLabel: before[index].dayLabel,
      slot: before[index].slot,
      fromName: getRecipe(before[index].recipeId).name,
      toName: recipe.name,
      reason:
        saved >= 0.5
          ? `Cut about ${Math.round(saved)} from the weekly shop`
          : 'Lower-cost meal that reuses ingredients and stays within your limits',
    })
    running = next
  }
  return changes
}

export function optimizePlan(plan: MealPlan): MealPlan {
  const prefs = { ...plan.prefs, budget: plan.prefs.budget }
  let meals = [...plan.meals]
  const changes: PlanChange[] = []

  let cost = shoppingCost(meals, prefs)
  if (cost > prefs.budget + 0.05) {
    const optimizedMeals = searchCheaperWeek(meals, prefs)
    if (shoppingCost(optimizedMeals, prefs) + 0.01 < cost) {
      changes.push(...describeMealChanges(meals, optimizedMeals, prefs))
      meals = optimizedMeals
    }
  } else {
    const seen = new Set<string>()
    for (let pass = 0; pass < 12; pass += 1) {
      const signature = meals.map((meal) => meal.recipeId).join('|')
      if (seen.has(signature)) break
      seen.add(signature)
      const grocery = groceryFromMeals(meals, prefs.pantry)
      const currentCost = grocery.estimatedCost
      const currentWaste = wasteScore(meals, grocery)
      const currentUnique = uniqueRecipeCount(meals)
      const currentConsecutive = consecutiveRepeatCount(meals)
      let best: {
        index: number
        recipe: Recipe
        cost: number
        waste: number
        unique: number
        share: number
      } | null = null

      for (let index = 0; index < meals.length; index += 1) {
        const currentRecipe = getRecipe(meals[index].recipeId)
        const pool = compatiblePool(prefs, meals[index].slot)
        const currentShare = weekOverlap(meals, index, currentRecipe)
        for (const candidate of pool) {
          if (candidate.id === meals[index].recipeId) continue
          if (neighborId(meals, index, -1) === candidate.id) continue
          if (neighborId(meals, index, 1) === candidate.id) continue
          const currentUses = meals.filter((meal) => meal.recipeId === meals[index].recipeId).length
          const uses = usageAfterSwap(meals, index, candidate.id)
          const duplicateRepair = currentUses > 1 && uses <= 2
          if (!duplicateRepair && violatesHardVariety(meals, index, candidate.id, pool)) continue
          if (uses > 2 && pool.length >= 4) continue
          const nextMeals = withRecipeAt(meals, index, candidate, prefs.people)
          const nextGrocery = groceryFromMeals(nextMeals, prefs.pantry)
          const nextCost = nextGrocery.estimatedCost
          const nextWaste = wasteScore(nextMeals, nextGrocery)
          const nextUnique = uniqueRecipeCount(nextMeals)
          const nextConsecutive = consecutiveRepeatCount(nextMeals)
          const nextShare = weekOverlap(nextMeals, index, candidate)
          if (nextConsecutive > currentConsecutive) continue
          if (nextUnique < currentUnique && !duplicateRepair) continue
          const cheaper = nextCost + 0.01 < currentCost
          const greener = nextWaste > currentWaste && nextCost <= currentCost + 0.25
          const sharesMore =
            nextShare > currentShare + 1 && nextWaste >= currentWaste && nextCost <= currentCost
          if (!cheaper && !greener && !sharesMore) continue
          const better =
            !best ||
            nextCost < best.cost - 0.08 ||
            (Math.abs(nextCost - best.cost) <= 0.08 && nextWaste > best.waste) ||
            (Math.abs(nextCost - best.cost) <= 0.08 && nextWaste === best.waste && nextShare > best.share)
          if (better) {
            best = {
              index,
              recipe: candidate,
              cost: nextCost,
              waste: nextWaste,
              unique: nextUnique,
              share: nextShare,
            }
          }
        }
      }
      if (!best) break
      const fromRecipe = getRecipe(meals[best.index].recipeId)
      const current = meals[best.index]
      meals = withRecipeAt(meals, best.index, best.recipe, prefs.people)
      const saved = currentCost - best.cost
      changes.push({
        dayLabel: current.dayLabel,
        slot: current.slot,
        fromName: fromRecipe.name,
        toName: best.recipe.name,
        reason:
          saved > 0.15
            ? `Cut about ${Math.round(saved)} from the weekly shop`
            : best.waste > currentWaste
              ? 'Reused more ingredients and lowered waste'
              : 'Shares more ingredients with the rest of the week',
      })
      if (changes.length >= 8) break
    }
  }

  const next = {
    ...plan,
    meals,
    lastOptimization: changes,
    ...summarize(meals, prefs),
  }
  if (changes.length === 0) {
    next.notes = [
      ...next.notes,
      'Optimize found no cheaper swap that keeps breakfast, lunch, and dinner varied. Add pantry items or raise the weekly budget for more room.',
    ]
  }
  return next
}

export function alternativesFor(recipeId: string, prefs: PlannerPrefs): Recipe[] {
  const recipe = getRecipe(recipeId)
  const fromIds = recipe.alternativeIds
    .map((id) => RECIPE_BY_ID.get(id))
    .filter((item): item is Recipe => Boolean(item))
    .filter((item) => item.slot === recipe.slot && isRecipeCompatible(item, prefs))
  const extra = RECIPES.filter(
    (item) =>
      item.slot === recipe.slot &&
      item.id !== recipe.id &&
      isRecipeCompatible(item, prefs) &&
      !fromIds.some((alt) => alt.id === item.id),
  ).slice(0, 2)
  return [...fromIds, ...extra].slice(0, 4)
}
