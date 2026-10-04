export type GroceryCategory = 'Produce' | 'Meat' | 'Dairy' | 'Pantry'
export type MealSlot = 'breakfast' | 'lunch' | 'dinner'
export type DietType =
  | 'omnivore'
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'halal'
  | 'keto'

export type WizardStep =
  | 'budget'
  | 'people'
  | 'meals'
  | 'diet'
  | 'allergies'
  | 'excluded'
  | 'pantry'
  | 'generate'
export type AppScreen = 'wizard' | 'plan' | 'grocery'

export interface Ingredient {
  name: string
  quantity: number
  unit: string
  category: GroceryCategory
  unitCost: number
}

export interface Nutrition {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface Recipe {
  id: string
  name: string
  slot: MealSlot
  description: string
  cookMinutes: number
  baseServings: number
  diets: DietType[]
  allergens: string[]
  ingredients: Ingredient[]
  steps: string[]
  nutritionPerServing: Nutrition
  alternativeIds: string[]
  swapNote: string
}

export interface PantryItem {
  name: string
  quantity: number | null
  unit: string
}

export interface PlannerPrefs {
  budget: number
  people: number
  mealsPerDay: 1 | 2 | 3
  cookMinutesMax: number
  diet: DietType
  allergies: string[]
  excludedFoods: string[]
  pantry: PantryItem[]
}

export interface PlannedMeal {
  date: string
  dayLabel: string
  slot: MealSlot
  recipeId: string
  servings: number
  estimatedCost: number
}

export interface PlanChange {
  dayLabel: string
  slot: MealSlot
  fromName: string
  toName: string
  reason: string
}

export interface MealPlan {
  id: string
  generatedAt: string
  prefs: PlannerPrefs
  meals: PlannedMeal[]
  estimatedCost: number
  remaining: number
  wasteScore: number
  notes: string[]
  budgetStatus: 'ok' | 'tight' | 'insufficient'
  suggestedMinBudget: number
  lastOptimization?: PlanChange[]
}

export interface GroceryLine {
  name: string
  quantity: number
  unit: string
  category: GroceryCategory
  estimatedCost: number
  coveredByPantry: boolean
}

export interface GroceryList {
  groups: Record<GroceryCategory, GroceryLine[]>
  estimatedCost: number
  itemCount: number
  pantrySavings: number
}

export interface PersistedState {
  prefs: PlannerPrefs
  wizardStep: WizardStep
  screen: AppScreen
  plan: MealPlan | null
}
