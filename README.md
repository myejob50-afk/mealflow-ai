# MealFlow AI

English-first weekly family meal planner. Turn budget, household size, meals per day, diet, allergies, exclusions, cook time, and pantry items into a 7-day plan and a grouped grocery list.

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL. The MVP uses a local recipe catalog and `localStorage` — no API key or backend.

## Flow

Budget → People → Meals → Diet/Allergies → What I Have → Generate → 7-day plan → Optimize → Shopping list.

Meal detail sheets include ingredients, servings, nutrition, and swap alternatives. Optimize prefers cheaper meals, pantry use, and shared ingredients.

AI/API generation can replace `src/engine/plan.ts` later without changing the UI contract.
