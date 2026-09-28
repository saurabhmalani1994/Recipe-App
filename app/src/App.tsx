import { HashRouter, Route, Routes } from 'react-router-dom'
import { AndroidBackButton } from './components/AndroidBackButton'
import { BottomNav } from './components/BottomNav'
import { Header } from './components/Header'
import { DietProvider } from './state/diet'
import { Cook } from './routes/Cook'
import { Favorites } from './routes/Favorites'
import { GroceryList } from './routes/GroceryList'
import { Home } from './routes/Home'
import { ImportFromUrl } from './routes/ImportFromUrl'
import { Kitchen } from './routes/Kitchen'
import { MyRecipeEditor } from './routes/MyRecipeEditor'
import { MyRecipes } from './routes/MyRecipes'
import { Plan } from './routes/Plan'
import { RecipeDetail } from './routes/RecipeDetail'
import { Settings } from './routes/Settings'

export function App() {
  return (
    <DietProvider>
      <HashRouter>
        <AndroidBackButton />
        <div className="app-shell">
          <Header />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/cook" element={<Cook />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/list" element={<GroceryList />} />
              <Route path="/my-recipes" element={<MyRecipes />} />
              <Route path="/my-recipes/import" element={<ImportFromUrl />} />
              <Route path="/my-recipes/:id" element={<MyRecipeEditor />} />
              <Route path="/recipe/:id" element={<RecipeDetail />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/kitchen" element={<Kitchen />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
          <BottomNav />
        </div>
      </HashRouter>
    </DietProvider>
  )
}

export default App
