import { AppShell } from './components/AppShell'
import { GroceryView } from './components/GroceryView'
import { PlanView } from './components/PlanView'
import { Wizard } from './components/Wizard'
import { MealFlowProvider } from './store/MealFlowContext'
import { useMealFlow } from './store/useMealFlow'

function Screen() {
  const { screen } = useMealFlow()
  if (screen === 'plan') return <PlanView />
  if (screen === 'grocery') return <GroceryView />
  return <Wizard />
}

function App() {
  return (
    <MealFlowProvider>
      <AppShell>
        <Screen />
      </AppShell>
    </MealFlowProvider>
  )
}

export default App
