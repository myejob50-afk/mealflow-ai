import { createContext, useContext } from 'react'
import type {
  AppScreen,
  GroceryList,
  MealPlan,
  PlannerPrefs,
  WizardStep,
} from '../types/mealflow'

export interface MealFlowContextValue {
  prefs: PlannerPrefs
  setPrefs: (patch: Partial<PlannerPrefs>) => void
  wizardStep: WizardStep
  setWizardStep: (step: WizardStep) => void
  screen: AppScreen
  plan: MealPlan | null
  grocery: GroceryList | null
  generating: boolean
  error: string | null
  goNext: () => void
  goBack: () => void
  generate: () => Promise<void>
  optimize: () => void
  replaceMeal: (index: number, recipeId: string) => void
  openPlan: () => void
  openGrocery: () => void
  startOver: () => void
}

export const MealFlowContext = createContext<MealFlowContextValue | null>(null)

export function useMealFlow(): MealFlowContextValue {
  const value = useContext(MealFlowContext)
  if (!value) {
    throw new Error('useMealFlow must be used inside MealFlowProvider')
  }
  return value
}
