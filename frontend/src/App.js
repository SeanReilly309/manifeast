import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AppProvider } from "@/context/AppContext";
import AppShell from "@/components/AppShell";
import Home from "@/pages/Home";
import Scan from "@/pages/Scan";
import Results from "@/pages/Results";
import RecipeDetail from "@/pages/RecipeDetail";
import ShoppingList from "@/pages/ShoppingList";
import Favorites from "@/pages/Favorites";
import CookMode from "@/pages/CookMode";
import About from "@/pages/About";

const TOAST_OPTIONS = {
  style: {
    fontFamily: "Outfit, system-ui, sans-serif",
    borderRadius: "16px",
  },
};

function App() {
  return (
    <div className="App">
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Home />} />
              <Route path="/scan" element={<Scan />} />
              <Route path="/results" element={<Results />} />
              <Route path="/recipe/:idx" element={<RecipeDetail />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/shopping" element={<ShoppingList />} />
              <Route path="/about" element={<About />} />
            </Route>
            <Route path="/recipe/:idx/cook" element={<CookMode />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" richColors toastOptions={TOAST_OPTIONS} />
      </AppProvider>
    </div>
  );
}

export default App;
