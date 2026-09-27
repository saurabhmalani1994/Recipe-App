import { HashRouter, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { Header } from './components/Header'
import { DietProvider } from './state/diet'
import { Cook } from './routes/Cook'
import { GroceryList } from './routes/GroceryList'
import { Home } from './routes/Home'
import { MyRecipes } from './routes/MyRecipes'
import { Plan } from './routes/Plan'

export function App() {
  return (
    <DietProvider>
      <HashRouter>
        <div className="app-shell">
          <Header />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/cook" element={<Cook />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/list" element={<GroceryList />} />
              <Route path="/my-recipes" element={<MyRecipes />} />
            </Routes>
          </main>
          <BottomNav />
        </div>
      </HashRouter>
    </DietProvider>
  )
}

export default App
