import { useEffect } from 'react'
import { HashRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AndroidBackButton } from './components/AndroidBackButton'
import { BottomNav } from './components/BottomNav'
import { ChromeProvider, useChrome } from './components/shell/chrome'
import { routeTitle, tabIndexOf } from './components/shell/tabs'
import { TabPager } from './components/shell/TabPager'
import { Icon } from './components/ui/Icon'
import { TopBar } from './components/ui/TopBar'
import { DietProvider } from './state/diet'
import { Cook } from './routes/Cook'
import { Favorites } from './routes/Favorites'
import { GroceryList } from './routes/GroceryList'
import { Home } from './routes/Home'
import { ImportFromUrl } from './routes/ImportFromUrl'
import { Kitchen } from './routes/Kitchen'
import { SnackbarProvider } from './components/ui/Snackbar'
import { MyRecipeDetail } from './routes/MyRecipeDetail'
import { MyRecipeEditor } from './routes/MyRecipeEditor'
import { MyRecipes } from './routes/MyRecipes'
import { Plan } from './routes/Plan'
import { RecipeDetail } from './routes/RecipeDetail'
import { Settings } from './routes/Settings'

/** The five tab screens, in `TABS` order (components/shell/chrome.tsx). */
const TAB_SCREENS = [<Home />, <Cook />, <Plan />, <GroceryList />, <MyRecipes />]

/** React Router keeps the history index in `history.state.idx`; 0 means a deep link opened here. */
function canGoBack(): boolean {
  const state = window.history.state as { idx?: number } | null
  return (state?.idx ?? 0) > 0
}

function AppTopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { elevated, collapsed } = useChrome()
  const isTab = tabIndexOf(pathname) >= 0
  return (
    <TopBar
      title={routeTitle(pathname)}
      onBack={isTab ? undefined : () => (canGoBack() ? navigate(-1) : navigate('/'))}
      elevated={elevated}
      collapsed={collapsed}
      actions={
        pathname === '/settings' ? undefined : (
          <Link to="/settings" className="icon-button" aria-label="Settings">
            <Icon name="settings" />
          </Link>
        )
      }
    />
  )
}

/** A screen below the tabs (recipe, settings, …): one ordinary scrolling page. */
function StackScreen() {
  const { pathname } = useLocation()
  const { onScroll, reset } = useChrome()
  useEffect(() => {
    reset()
  }, [pathname, reset])
  return (
    <div className="stack-screen app-scroll" onScroll={onScroll} key={pathname}>
      <Routes>
        <Route path="/my-recipes/import" element={<ImportFromUrl />} />
        <Route path="/my-recipes/:id/view" element={<MyRecipeDetail />} />
        <Route path="/my-recipes/:id" element={<MyRecipeEditor />} />
        <Route path="/recipe/:id" element={<RecipeDetail />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/kitchen" element={<Kitchen />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  )
}

function Shell() {
  const { pathname } = useLocation()
  const { collapsed } = useChrome()
  const isTab = tabIndexOf(pathname) >= 0
  return (
    // `app-shell--bar-hidden` moves sticky headers (List aisles, the recipe's servings bar) up
    // into the space the tucked-away top bar leaves.
    <div className={`app-shell${collapsed ? ' app-shell--bar-hidden' : ''}`}>
      <AppTopBar />
      <main className="app-main">
        {isTab ? <TabPager screens={TAB_SCREENS} /> : <StackScreen />}
      </main>
      <BottomNav />
    </div>
  )
}

export function App() {
  return (
    <DietProvider>
      <HashRouter>
        <AndroidBackButton />
        <ChromeProvider>
          <SnackbarProvider>
            <Shell />
          </SnackbarProvider>
        </ChromeProvider>
      </HashRouter>
    </DietProvider>
  )
}

export default App
