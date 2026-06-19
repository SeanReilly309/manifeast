import { useCallback, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Camera, Upload, X, Plus, Loader2, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { suggestRecipes } from "../lib/api";
import { useScanIngredients } from "../hooks/useScanIngredients";

const FRIDGE_IMG =
  "https://images.pexels.com/photos/31485991/pexels-photo-31485991.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

function ModeToggle({ mode, setMode }) {
  return (
    <div className="inline-flex p-1 rounded-full bg-white border border-brand-line">
      <button
        data-testid="mode-photo-btn"
        onClick={() => setMode("photo")}
        className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
          mode === "photo" ? "bg-brand-primary text-white" : "text-brand-text-soft"
        }`}
      >
        <Camera className="w-4 h-4 inline mr-2" strokeWidth={1.6} /> Photo
      </button>
      <button
        data-testid="mode-manual-btn"
        onClick={() => setMode("manual")}
        className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
          mode === "manual" ? "bg-brand-primary text-white" : "text-brand-text-soft"
        }`}
      >
        Manual
      </button>
    </div>
  );
}

function PhotoPanel({ preview, scanning, onPickCamera, onPickFile }) {
  return (
    <div className="grid md:grid-cols-2 gap-6 md:gap-10 items-start">
      <div
        data-testid="photo-dropzone"
        className="relative aspect-[4/5] md:aspect-square rounded-3xl border-2 border-dashed border-brand-line bg-white overflow-hidden flex items-center justify-center"
      >
        {preview ? (
          <img src={preview} alt="Fridge preview" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <img src={FRIDGE_IMG} alt="fridge" className="absolute inset-0 w-full h-full object-cover opacity-25" />
        )}
        {scanning && (
          <div
            className="absolute inset-0 bg-brand-text/55 backdrop-blur-sm flex flex-col items-center justify-center text-white gap-3"
            data-testid="scan-loading"
          >
            <Loader2 className="w-8 h-8 animate-spin" strokeWidth={1.5} />
            <p className="font-serif-display text-2xl italic">Reading the shelves&hellip;</p>
          </div>
        )}
        {!preview && !scanning && (
          <div className="relative text-center px-6 z-10">
            <div className="font-serif-display text-2xl text-brand-text mb-1">Drop a photo</div>
            <p className="text-sm text-brand-text-soft">or use one of the buttons below</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Button
          data-testid="open-camera-btn"
          disabled={scanning}
          onClick={onPickCamera}
          className="w-full rounded-full py-6 text-base font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white shadow-[0_8px_24px_rgba(224,122,95,0.32)]"
        >
          <Camera className="w-5 h-5 mr-2" strokeWidth={1.7} /> Open camera
        </Button>
        <Button
          data-testid="upload-photo-btn"
          disabled={scanning}
          variant="outline"
          onClick={onPickFile}
          className="w-full rounded-full py-6 text-base font-semibold border-brand-text/15 text-brand-text bg-white hover:bg-brand-line/40"
        >
          <Upload className="w-5 h-5 mr-2" strokeWidth={1.7} /> Upload from device
        </Button>
        <p className="text-xs text-brand-text-soft pt-1 leading-relaxed">
          Tip: Good light and clear shelves help us spot more. You can always edit the list before getting recipes.
        </p>
      </div>
    </div>
  );
}

function ManualPanel({ value, onChange, onAdd }) {
  return (
    <div className="bg-white border border-brand-line rounded-3xl p-6 md:p-8 space-y-5">
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs tracking-[0.18em] uppercase font-semibold text-brand-text-soft mb-2 block">
            Add ingredient(s) &mdash; comma separated
          </label>
          <Input
            data-testid="manual-input"
            value={value}
            placeholder="e.g. eggs, milk, pasta, garlic"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAdd();
              }
            }}
            className="bg-transparent border-0 border-b-2 border-brand-line focus:border-brand-primary rounded-none px-0 py-3 text-lg focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <Button
          data-testid="manual-add-btn"
          onClick={onAdd}
          className="rounded-full bg-brand-text hover:bg-brand-text/90 text-white px-5 py-5"
        >
          <Plus className="w-5 h-5" strokeWidth={1.8} />
        </Button>
      </div>
    </div>
  );
}

function IngredientChipList({ ingredients, onRemove }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="ingredient-chip-list">
      {ingredients.map((it) => (
        <span key={it} className="chip-available group" data-testid={`chip-${it}`}>
          {it}
          <button
            data-testid={`remove-chip-${it}`}
            onClick={() => onRemove(it)}
            className="opacity-60 group-hover:opacity-100 hover:text-brand-err"
            aria-label={`Remove ${it}`}
          >
            <X className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </span>
      ))}
    </div>
  );
}

export default function Scan() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const startManual = new URLSearchParams(search).get("mode") === "manual";

  const { ingredients, setIngredients, setRecipes } = useApp();
  const [mode, setMode] = useState(startManual ? "manual" : "photo");
  const [manualInput, setManualInput] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const { preview, scanning, processFile } = useScanIngredients({
    existing: ingredients,
    onIngredients: setIngredients,
  });

  const addManual = useCallback(() => {
    const raw = manualInput.trim();
    if (!raw) return;
    const parts = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (parts.length === 0) return;
    setIngredients(Array.from(new Set([...ingredients, ...parts])));
    setManualInput("");
  }, [manualInput, ingredients, setIngredients]);

  const removeIngredient = useCallback(
    (name) => setIngredients(ingredients.filter((i) => i !== name)),
    [ingredients, setIngredients]
  );

  const handleFind = useCallback(async () => {
    if (ingredients.length === 0) {
      toast.error("Add at least one ingredient first.");
      return;
    }
    setSuggesting(true);
    try {
      const data = await suggestRecipes(ingredients, 5);
      setRecipes(data.recipes || []);
      navigate("/results");
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || "Could not get recipes";
      toast.error(msg);
    } finally {
      setSuggesting(false);
    }
  }, [ingredients, setRecipes, navigate]);

  return (
    <div className="space-y-10" data-testid="scan-page">
      <div className="space-y-3 animate-fade-up">
        <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">Step 1</p>
        <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
          What&rsquo;s in your kitchen?
        </h1>
        <p className="text-brand-text-soft max-w-xl">
          Snap a photo of your fridge or pantry, or type the things you have on hand.
        </p>
      </div>

      <ModeToggle mode={mode} setMode={setMode} />

      <input
        ref={cameraInputRef}
        data-testid="camera-input"
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => processFile(e.target.files?.[0])}
      />
      <input
        ref={fileInputRef}
        data-testid="file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => processFile(e.target.files?.[0])}
      />

      {mode === "photo" ? (
        <PhotoPanel
          preview={preview}
          scanning={scanning}
          onPickCamera={() => cameraInputRef.current?.click()}
          onPickFile={() => fileInputRef.current?.click()}
        />
      ) : (
        <ManualPanel value={manualInput} onChange={setManualInput} onAdd={addManual} />
      )}

      <div className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary mb-1">
              Your ingredients
            </p>
            <h2 className="font-serif-display text-2xl md:text-3xl font-medium text-brand-text">
              {ingredients.length === 0
                ? "Nothing yet"
                : `${ingredients.length} item${ingredients.length === 1 ? "" : "s"}`}
            </h2>
          </div>
          {ingredients.length > 0 && (
            <button
              data-testid="clear-ingredients-btn"
              onClick={() => setIngredients([])}
              className="text-sm text-brand-text-soft underline underline-offset-4 hover:text-brand-primary"
            >
              Clear all
            </button>
          )}
        </div>

        {ingredients.length === 0 ? (
          <p className="text-brand-text-soft text-sm">Add some ingredients above to get meal ideas.</p>
        ) : (
          <IngredientChipList ingredients={ingredients} onRemove={removeIngredient} />
        )}
      </div>

      <div className="editorial-divider" />

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-sm text-brand-text-soft max-w-md">
          Ready when you are. We&rsquo;ll find recipes that use what you have.
        </p>
        <Button
          data-testid="find-recipes-btn"
          disabled={ingredients.length === 0 || suggesting}
          onClick={handleFind}
          className="rounded-full px-7 py-6 text-base font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white shadow-[0_8px_24px_rgba(224,122,95,0.32)] disabled:opacity-50"
        >
          {suggesting ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" strokeWidth={1.7} /> Finding meals&hellip;</>
          ) : (
            <><Sparkles className="w-5 h-5 mr-2" strokeWidth={1.7} /> Find meal ideas</>
          )}
        </Button>
      </div>
    </div>
  );
}
