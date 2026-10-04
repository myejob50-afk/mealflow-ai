import type { PersistedState, PlannerPrefs, WizardStep } from '../types/mealflow'

const STORAGE_KEY = 'mealflow-ai:v2'
const LEGACY_KEYS = ['mealflow-ai:v1']

export const DEFAULT_PREFS: PlannerPrefs = {
  budget: 120,
  people: 4,
  mealsPerDay: 3,
  cookMinutesMax: 40,
  diet: 'omnivore',
  allergies: [],
  excludedFoods: [],
  pantry: [],
}

export const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: 'budget', label: 'Budget' },
  { id: 'people', label: 'Household' },
  { id: 'meals', label: 'Meals' },
  { id: 'diet', label: 'Diet' },
  { id: 'allergies', label: 'Allergies' },
  { id: 'excluded', label: 'Excluded' },
  { id: 'pantry', label: 'Pantry' },
  { id: 'generate', label: 'Generate' },
]

function alignPlanBudget(state: PersistedState): PersistedState {
  const selectedBudget = state.prefs.budget
  if (!state.plan) return state
  const staleMin = state.plan.suggestedMinBudget
  const planBudget = state.plan.prefs.budget
  const usedSuggestedMin = staleMin != null && planBudget === staleMin && selectedBudget !== staleMin
  if (planBudget === selectedBudget && !usedSuggestedMin) return state
  return {
    ...state,
    plan: {
      ...state.plan,
      prefs: { ...state.plan.prefs, budget: selectedBudget },
    },
  }
}

export function loadState(): PersistedState | null {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key)
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (!parsed.prefs || typeof parsed.prefs.budget !== 'number') return null
    return alignPlanBudget(parsed)
  } catch {
    return null
  }
}

export function saveState(state: PersistedState): void {
  const aligned = alignPlanBudget(state)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(aligned))
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY)
  for (const key of LEGACY_KEYS) localStorage.removeItem(key)
}
