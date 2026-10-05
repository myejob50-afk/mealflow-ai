import { useMemo, useState, type ReactNode } from 'react'
import { ALLERGY_OPTIONS, COMMON_PANTRY, DIET_OPTIONS, slotsForMealsPerDay } from '../data/recipes'
import { money } from '../engine/money'
import { suggestedMinimumBudget } from '../engine/plan'
import { useMealFlow } from '../store/useMealFlow'
import { Stepper } from './AppShell'
import { Button } from './ui/Button'
import { Card } from './ui/Card'

function StepFrame({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div>
      <Stepper />
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 max-w-xl text-ink-soft">{subtitle}</p>
      <div className="mt-6">{children}</div>
      <div className="mt-8 flex items-center justify-between gap-3">{footer}</div>
    </div>
  )
}

function BudgetStep() {
  const { prefs, setPrefs, goNext } = useMealFlow()
  return (
    <StepFrame
      title="What’s your weekly grocery budget?"
      subtitle="We’ll build a 7-day plan that aims to stay inside this number, then show what’s left."
      footer={
        <>
          <span />
          <Button onClick={goNext}>Continue</Button>
        </>
      }
    >
      <Card className="p-6">
        <p className="font-display text-5xl font-semibold text-sage">{money(prefs.budget)}</p>
        <p className="mt-1 text-sm text-ink-soft">US dollars · household grocery spend</p>
        <input
          aria-label="Weekly budget"
          type="range"
          min={40}
          max={300}
          step={5}
          value={prefs.budget}
          onChange={(event) => setPrefs({ budget: Number(event.target.value) })}
          className="mt-6 w-full accent-sage"
        />
        <div className="mt-2 flex justify-between text-xs text-ink-soft">
          <span>$40</span>
          <span>$300</span>
        </div>
      </Card>
    </StepFrame>
  )
}

function PeopleStep() {
  const { prefs, setPrefs, goNext, goBack } = useMealFlow()
  return (
    <StepFrame
      title="How many people are you feeding?"
      subtitle="Recipes scale to this household size so servings and the grocery list stay realistic."
      footer={
        <>
          <Button variant="ghost" onClick={goBack}>
            Back
          </Button>
          <Button onClick={goNext}>Continue</Button>
        </>
      }
    >
      <div className="flex items-center gap-4">
        <Button
          variant="secondary"
          onClick={() => setPrefs({ people: Math.max(1, prefs.people - 1) })}
        >
          −
        </Button>
        <Card className="min-w-40 flex-1 py-6 text-center">
          <p className="font-display text-5xl font-semibold">{prefs.people}</p>
          <p className="text-sm text-ink-soft">{prefs.people === 1 ? 'person' : 'people'}</p>
        </Card>
        <Button
          variant="secondary"
          onClick={() => setPrefs({ people: Math.min(12, prefs.people + 1) })}
        >
          +
        </Button>
      </div>
    </StepFrame>
  )
}

function MealsStep() {
  const { prefs, setPrefs, goNext, goBack } = useMealFlow()
  const times = [20, 30, 40, 60]
  return (
    <StepFrame
      title="Meals per day and cooking time"
      subtitle="We’ll fill breakfast, lunch, and/or dinner for seven days, using recipes that fit your weeknights."
      footer={
        <>
          <Button variant="ghost" onClick={goBack}>
            Back
          </Button>
          <Button onClick={goNext}>Continue</Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        {([1, 2, 3] as const).map((count) => (
          <button
            key={count}
            type="button"
            onClick={() => setPrefs({ mealsPerDay: count })}
            className={`rounded-3xl border p-4 text-center ${
              prefs.mealsPerDay === count
                ? 'border-sage bg-sage text-white'
                : 'border-sand bg-white'
            }`}
          >
            <span className="block font-display text-3xl font-semibold">{count}</span>
            <span className="text-xs font-medium opacity-80">
              {slotsForMealsPerDay(count).join(' · ')}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-6 text-sm font-semibold text-ink">Max cooking time</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {times.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => setPrefs({ cookMinutesMax: minutes })}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              prefs.cookMinutesMax === minutes
                ? 'bg-sage text-white'
                : 'bg-white text-ink border border-sand'
            }`}
          >
            {minutes} min
          </button>
        ))}
      </div>
    </StepFrame>
  )
}

function DietStep() {
  const { prefs, setPrefs, goNext, goBack } = useMealFlow()
  return (
    <StepFrame
      title="Any dietary pattern we should follow?"
      subtitle="The planner only uses recipes that match this diet."
      footer={
        <>
          <Button variant="ghost" onClick={goBack}>
            Back
          </Button>
          <Button onClick={goNext}>Continue</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {DIET_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setPrefs({ diet: option.id })}
            className={`rounded-3xl border p-4 text-left ${
              prefs.diet === option.id ? 'border-sage bg-white ring-2 ring-sage/30' : 'border-sand bg-white'
            }`}
          >
            <p className="font-semibold">{option.label}</p>
            <p className="text-sm text-ink-soft">{option.hint}</p>
          </button>
        ))}
      </div>
    </StepFrame>
  )
}

function AllergiesStep() {
  const { prefs, setPrefs, goNext, goBack } = useMealFlow()
  return (
    <StepFrame
      title="Allergies to avoid"
      subtitle="We’ll exclude recipes that contain these allergens."
      footer={
        <>
          <Button variant="ghost" onClick={goBack}>
            Back
          </Button>
          <Button onClick={goNext}>Continue</Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        {ALLERGY_OPTIONS.map((allergy) => {
          const on = prefs.allergies.includes(allergy)
          return (
            <button
              key={allergy}
              type="button"
              onClick={() =>
                setPrefs({
                  allergies: on
                    ? prefs.allergies.filter((item) => item !== allergy)
                    : [...prefs.allergies, allergy],
                })
              }
              className={`rounded-full px-3 py-1.5 text-sm capitalize ${
                on ? 'bg-terra text-white' : 'border border-sand bg-white'
              }`}
            >
              {allergy}
            </button>
          )
        })}
      </div>
      <p className="mt-4 text-sm text-ink-soft">Leave them all off if nobody in the household has allergies.</p>
    </StepFrame>
  )
}

function ExcludedStep() {
  const { prefs, setPrefs, goNext, goBack } = useMealFlow()
  const [draft, setDraft] = useState('')

  function addExcluded() {
    const value = draft.trim()
    if (!value) return
    if (!prefs.excludedFoods.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setPrefs({ excludedFoods: [...prefs.excludedFoods, value] })
    }
    setDraft('')
  }

  return (
    <StepFrame
      title="Foods to leave out"
      subtitle="Skip ingredients or dishes the household will not eat, even if they are not allergies."
      footer={
        <>
          <Button variant="ghost" onClick={goBack}>
            Back
          </Button>
          <Button onClick={goNext}>Continue</Button>
        </>
      }
    >
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addExcluded()
            }
          }}
          placeholder="e.g. mushrooms, cilantro"
          className="min-h-11 flex-1 rounded-2xl border border-sand bg-white px-3 text-sm outline-none ring-sage/30 focus:ring-2"
        />
        <Button variant="secondary" onClick={addExcluded}>
          Add
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {prefs.excludedFoods.map((food) => (
          <button
            key={food}
            type="button"
            className="rounded-full bg-sand px-3 py-1 text-sm"
            onClick={() =>
              setPrefs({ excludedFoods: prefs.excludedFoods.filter((item) => item !== food) })
            }
          >
            {food} ×
          </button>
        ))}
      </div>
    </StepFrame>
  )
}

function PantryStep() {
  const { prefs, setPrefs, goNext, goBack } = useMealFlow()
  const [custom, setCustom] = useState('')

  function toggle(name: string, unit: string) {
    const exists = prefs.pantry.some((item) => item.name === name)
    setPrefs({
      pantry: exists
        ? prefs.pantry.filter((item) => item.name !== name)
        : [...prefs.pantry, { name, quantity: unit === 'pcs' || unit === 'cloves' ? 4 : 400, unit }],
    })
  }

  function addCustom() {
    const name = custom.trim()
    if (!name) return
    if (!prefs.pantry.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      setPrefs({ pantry: [...prefs.pantry, { name, quantity: 1, unit: 'pcs' }] })
    }
    setCustom('')
  }

  return (
    <StepFrame
      title="What do you already have?"
      subtitle="We’ll subtract these from the shopping list and prefer recipes that use them first."
      footer={
        <>
          <Button variant="ghost" onClick={goBack}>
            Back
          </Button>
          <Button onClick={goNext}>Continue</Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        {COMMON_PANTRY.map((item) => {
          const on = prefs.pantry.some((entry) => entry.name === item.name)
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => toggle(item.name, item.unit)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                on ? 'bg-sage text-white' : 'border border-sand bg-white'
              }`}
            >
              {item.name}
            </button>
          )
        })}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addCustom()
            }
          }}
          placeholder="Add anything else"
          className="min-h-11 flex-1 rounded-2xl border border-sand bg-white px-3 text-sm outline-none ring-sage/30 focus:ring-2"
        />
        <Button variant="secondary" onClick={addCustom}>
          Add
        </Button>
      </div>
    </StepFrame>
  )
}

function GenerateStep() {
  const { prefs, goBack, generate, generating, error, plan, openPlan } = useMealFlow()
  const budgetNeed = useMemo(() => {
    try {
      return suggestedMinimumBudget(prefs)
    } catch {
      return null
    }
  }, [prefs])
  const insufficient = budgetNeed !== null && prefs.budget < budgetNeed

  return (
    <StepFrame
      title="Ready to generate the week?"
      subtitle="Nourivoo AI will build a personalized 7-day meal plan based on your budget, household, dietary preferences, and pantry."
      footer={
        <>
          <Button variant="ghost" onClick={goBack} disabled={generating}>
            Back
          </Button>
          <Button onClick={() => void generate()} disabled={generating}>
            {generating ? 'Building your week…' : 'Generate 7-day plan'}
          </Button>
        </>
      }
    >
      <Card className="space-y-3 p-5">
        <Row label="Weekly budget" value={money(prefs.budget)} />
        <Row label="Household" value={`${prefs.people} people`} />
        <Row
          label="Meals"
          value={`${prefs.mealsPerDay}/day · max ${prefs.cookMinutesMax} min`}
        />
        <Row label="Diet" value={prefs.diet} />
        <Row
          label="Allergies"
          value={prefs.allergies.length ? prefs.allergies.join(', ') : 'None'}
        />
        <Row
          label="Excluded"
          value={prefs.excludedFoods.length ? prefs.excludedFoods.join(', ') : 'None'}
        />
        <Row
          label="Pantry"
          value={prefs.pantry.length ? `${prefs.pantry.length} items` : 'Empty'}
        />
      </Card>
      {insufficient && (
        <div className="mt-4 rounded-2xl bg-terra/10 px-4 py-3 text-sm text-danger">
          <p className="font-semibold">This weekly budget is not enough</p>
          <p className="mt-1">
            {money(prefs.budget)} cannot cover {prefs.people} people eating {prefs.mealsPerDay} meals a
            day for 7 days. A realistic minimum weekly grocery budget for these inputs is{' '}
            <strong>{money(budgetNeed)}</strong>
            {budgetNeed != null ? `, which is ${money(budgetNeed - prefs.budget)} short` : ''}. Raise
            the weekly budget — this is not a daily amount — then generate again.
          </p>
        </div>
      )}
      {error && !insufficient && (
        <p className="mt-4 rounded-2xl bg-terra/10 px-4 py-3 text-sm text-danger">{error}</p>
      )}
      {error && insufficient && (
        <p className="mt-3 text-sm text-danger">{error}</p>
      )}
      {plan && !generating && (
        <button
          type="button"
          onClick={openPlan}
          className="mt-4 text-sm font-semibold text-sage underline"
        >
          Open last saved plan
        </button>
      )}
    </StepFrame>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-ink-soft">{label}</span>
      <span className="text-right font-medium capitalize">{value}</span>
    </div>
  )
}

export function Wizard() {
  const { wizardStep } = useMealFlow()
  if (wizardStep === 'budget') return <BudgetStep />
  if (wizardStep === 'people') return <PeopleStep />
  if (wizardStep === 'meals') return <MealsStep />
  if (wizardStep === 'diet') return <DietStep />
  if (wizardStep === 'allergies') return <AllergiesStep />
  if (wizardStep === 'excluded') return <ExcludedStep />
  if (wizardStep === 'pantry') return <PantryStep />
  return <GenerateStep />
}
