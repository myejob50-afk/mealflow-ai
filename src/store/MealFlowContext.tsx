import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  applyWizardBudget,
  buildGroceryList,
  generatePlan,
  InsufficientBudgetError,
  optimizePlan,
  refreshPlanTotals,
  swapMeal,
} from '../engine/plan'
import type { AppScreen, MealPlan, PlannerPrefs, WizardStep } from '../types/mealflow'
import { DEFAULT_PREFS, loadState, saveState, WIZARD_STEPS } from './persistence'
import { MealFlowContext } from './useMealFlow'

export function MealFlowProvider({ children }: { children: ReactNode }) {
  const stored = typeof window === 'undefined' ? null : loadState()
  const [prefs, setPrefsState] = useState<PlannerPrefs>(stored?.prefs ?? DEFAULT_PREFS)
  const [wizardStep, setWizardStep] = useState<WizardStep>(stored?.wizardStep ?? 'budget')
  const [screen, setScreen] = useState<AppScreen>(stored?.screen ?? 'wizard')
  const [plan, setPlan] = useState<MealPlan | null>(() => {
    const loaded = stored?.plan ?? null
    const budget = stored?.prefs?.budget
    if (!loaded) return null
    try {
      const aligned =
        budget == null || loaded.prefs.budget === budget
          ? loaded
          : applyWizardBudget(loaded, budget)
      return refreshPlanTotals(aligned)
    } catch {
      return loaded
    }
  })
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    saveState({ prefs, wizardStep, screen, plan })
  }, [prefs, wizardStep, screen, plan])

  const grocery = useMemo(() => {
    if (!plan) return null
    const aligned = plan.prefs.budget === prefs.budget ? plan : applyWizardBudget(plan, prefs.budget)
    return buildGroceryList(aligned)
  }, [plan, prefs.budget])

  const setPrefs = useCallback((patch: Partial<PlannerPrefs>) => {
    setPrefsState((current) => ({ ...current, ...patch }))
    if (patch.budget !== undefined) {
      const budget = patch.budget
      setPlan((current) => {
        if (!current || current.prefs.budget === budget) return current
        return applyWizardBudget(current, budget)
      })
    }
  }, [])

  const goNext = useCallback(() => {
    const index = WIZARD_STEPS.findIndex((step) => step.id === wizardStep)
    const next = WIZARD_STEPS[index + 1]
    if (next) setWizardStep(next.id)
  }, [wizardStep])

  const goBack = useCallback(() => {
    if (screen !== 'wizard') {
      setScreen('wizard')
      setWizardStep('generate')
      return
    }
    const index = WIZARD_STEPS.findIndex((step) => step.id === wizardStep)
    const prev = WIZARD_STEPS[index - 1]
    if (prev) setWizardStep(prev.id)
  }, [screen, wizardStep])

  const generate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    await new Promise((resolve) => window.setTimeout(resolve, 900))
    try {
      const nextPlan = generatePlan(prefs)
      if (nextPlan.prefs.budget !== prefs.budget) {
        throw new Error('Generated plan must keep the selected weekly budget.')
      }
      setPlan(nextPlan)
      setScreen('plan')
    } catch (caught) {
      if (caught instanceof InsufficientBudgetError) {
        setError(caught.message)
      } else {
        setError(caught instanceof Error ? caught.message : 'Could not generate a plan.')
      }
    } finally {
      setGenerating(false)
    }
  }, [prefs])

  const optimize = useCallback(() => {
    setPlan((current) => {
      if (!current) return current
      const aligned =
        current.prefs.budget === prefs.budget ? current : applyWizardBudget(current, prefs.budget)
      return optimizePlan(aligned)
    })
  }, [prefs.budget])

  const replaceMeal = useCallback((index: number, recipeId: string) => {
    setPlan((current) => (current ? swapMeal(current, index, recipeId) : current))
  }, [])

  const startOver = useCallback(() => {
    setScreen('wizard')
    setWizardStep('budget')
    setError(null)
  }, [])

  const value = {
    prefs,
    setPrefs,
    wizardStep,
    setWizardStep,
    screen,
    plan,
    grocery,
    generating,
    error,
    goNext,
    goBack,
    generate,
    optimize,
    replaceMeal,
    openPlan: () => setScreen('plan'),
    openGrocery: () => setScreen('grocery'),
    startOver,
  }

  return <MealFlowContext.Provider value={value}>{children}</MealFlowContext.Provider>
}
