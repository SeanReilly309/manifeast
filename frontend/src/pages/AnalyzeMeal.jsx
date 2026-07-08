import { useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Camera, Upload, Loader2, Sparkles, RefreshCw, Share2, History } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { analyzeMeal } from "../lib/api";
import { useApp } from "../context/AppContext";

const PLATE_IMG =
  "https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=900";

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const comma = result.indexOf(",");
      resolve({ base64: result.slice(comma + 1), mime: file.type || "image/jpeg" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function confidenceTone(c) {
  if (c === "high") return "bg-brand-secondary/15 text-brand-secondary-dark";
  if (c === "low") return "bg-brand-primary/15 text-brand-primary";
  return "bg-brand-accent/30 text-brand-text";
}

export default function AnalyzeMeal() {
  const { addMealToLog, mealLog } = useApp();
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const processFile = useCallback(async (file) => {
    if (!file) return;
    if (!/image\/(jpeg|jpg|png|webp)/i.test(file.type)) {
      toast.error("Please use a JPG, PNG, or WEBP image.");
      return;
    }
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setResult(null);
    setAnalyzing(true);
    try {
      const { base64, mime } = await readFileAsBase64(file);
      const data = await analyzeMeal(base64, mime);
      if (!data.is_food) {
        toast.error("That doesn't look like a meal — try a photo of a plate of food.");
        setResult(null);
      } else {
        setResult(data);
        addMealToLog(data);
        toast.success("Saved to your meal log");
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [addMealToLog]);

  const reset = () => {
    setResult(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const handleShare = async () => {
    if (!result) return;
    const n = result.nutrition;
    const text = `${result.meal_name} — analyzed by Manifeast\n\n${n.calories} kcal · ${n.protein_g}g protein · ${n.fat_g}g fat · ${n.carbs_g}g carbs\n\n${result.description}`;
    try {
      if (navigator.share && navigator.canShare && navigator.canShare({ text })) {
        await navigator.share({ title: result.meal_name, text });
        return;
      }
    } catch { /* aborted */ }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy — please try again.");
    }
  };

  return (
    <div className="space-y-10" data-testid="analyze-page">
      <div className="space-y-3 animate-fade-up">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-3">
            <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
              Analyze
            </p>
            <h1 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
              Snap a plate. <span className="italic text-brand-primary">Know your macros.</span>
            </h1>
            <p className="text-brand-text-soft max-w-xl">
              Point your camera at any meal you&rsquo;re about to eat &mdash; we&rsquo;ll estimate
              calories, protein, fat and carbs in seconds.
            </p>
          </div>
          <Link to="/log">
            <Button
              data-testid="view-log-btn"
              variant="outline"
              className="rounded-full border-brand-text/15 text-brand-text bg-white hover:bg-brand-line/40"
            >
              <History className="w-4 h-4 mr-2" strokeWidth={1.7} />
              Meal log {mealLog.length > 0 && (
                <span className="ml-2 bg-brand-primary text-white text-xs rounded-full px-2 py-0.5">
                  {mealLog.length}
                </span>
              )}
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 md:gap-10 items-start">
        <div
          data-testid="plate-dropzone"
          className="relative aspect-[4/5] md:aspect-square rounded-3xl border-2 border-dashed border-brand-line bg-white overflow-hidden flex items-center justify-center"
        >
          {preview ? (
            <img src={preview} alt="Meal preview" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <img src={PLATE_IMG} alt="plate" className="absolute inset-0 w-full h-full object-cover opacity-25" />
          )}
          {analyzing && (
            <div
              data-testid="analyze-loading"
              className="absolute inset-0 bg-brand-text/55 backdrop-blur-sm flex flex-col items-center justify-center text-white gap-3"
            >
              <Loader2 className="w-8 h-8 animate-spin" strokeWidth={1.5} />
              <p className="font-serif-display text-2xl italic">Weighing the plate&hellip;</p>
            </div>
          )}
          {!preview && !analyzing && (
            <div className="relative text-center px-6 z-10">
              <div className="font-serif-display text-2xl text-brand-text mb-1">Show us the plate</div>
              <p className="text-sm text-brand-text-soft">or use one of the buttons</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <input
            ref={cameraInputRef}
            data-testid="plate-camera-input"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => processFile(e.target.files?.[0])}
          />
          <input
            ref={fileInputRef}
            data-testid="plate-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => processFile(e.target.files?.[0])}
          />
          <Button
            data-testid="plate-open-camera-btn"
            disabled={analyzing}
            onClick={() => cameraInputRef.current?.click()}
            className="w-full rounded-full py-6 text-base font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white shadow-[0_8px_24px_rgba(224,122,95,0.32)]"
          >
            <Camera className="w-5 h-5 mr-2" strokeWidth={1.7} /> Open camera
          </Button>
          <Button
            data-testid="plate-upload-btn"
            disabled={analyzing}
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-full py-6 text-base font-semibold border-brand-text/15 text-brand-text bg-white hover:bg-brand-line/40"
          >
            <Upload className="w-5 h-5 mr-2" strokeWidth={1.7} /> Upload photo
          </Button>
          <p className="text-xs text-brand-text-soft pt-1 leading-relaxed">
            Tip: shoot from above with the whole plate in frame for the best guess.
            These are AI-estimated values &mdash; not clinical measurements.
          </p>
        </div>
      </div>

      {result && (
        <section
          data-testid="analyze-result"
          className="space-y-8 bg-white border border-brand-line rounded-3xl p-6 md:p-10 animate-fade-up"
        >
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
                  Meal detected
                </p>
                <span
                  data-testid="confidence-badge"
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider ${confidenceTone(result.confidence)}`}
                >
                  {result.confidence} confidence
                </span>
              </div>
              <h2 data-testid="meal-name" className="font-serif-display text-3xl md:text-4xl font-medium text-brand-text leading-tight">
                {result.meal_name}
              </h2>
              {result.description && (
                <p className="text-brand-text-soft leading-relaxed max-w-xl">{result.description}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                data-testid="analyze-share-btn"
                onClick={handleShare}
                className="w-11 h-11 rounded-full bg-white border border-brand-line flex items-center justify-center text-brand-text-soft hover:text-brand-primary hover:border-brand-primary/40 transition-colors"
                aria-label="Share result"
              >
                <Share2 className="w-4 h-4" strokeWidth={1.8} />
              </button>
              <Button
                data-testid="analyze-reset-btn"
                variant="outline"
                onClick={reset}
                className="rounded-full border-brand-text/15 text-brand-text bg-white hover:bg-brand-line/40"
              >
                <RefreshCw className="w-4 h-4 mr-2" strokeWidth={1.7} /> Try another
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 md:gap-6" data-testid="macros-grid">
            {[
              { label: "kcal", value: result.nutrition.calories, accent: true },
              { label: "protein", value: `${result.nutrition.protein_g}g` },
              { label: "fat", value: `${result.nutrition.fat_g}g` },
              { label: "carbs", value: `${result.nutrition.carbs_g}g` },
            ].map((m) => (
              <div key={m.label} className="text-center rounded-2xl bg-brand-bg py-6 md:py-8">
                <div className={`font-serif-display text-4xl md:text-6xl font-medium leading-none ${m.accent ? "text-brand-primary" : "text-brand-text"}`}>
                  {m.value}
                </div>
                <div className="text-[11px] tracking-[0.18em] uppercase text-brand-text-soft mt-3">
                  {m.label}
                </div>
              </div>
            ))}
          </div>

          {result.servings > 1 && (
            <p className="text-sm text-brand-text-soft italic">
              Values are per serving &mdash; the plate looks like about {result.servings} servings.
            </p>
          )}

          {result.identified_items.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-text-soft">
                What we spotted
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.identified_items.map((it) => (
                  <span key={it} className="chip-available">
                    <Sparkles className="w-3 h-3" strokeWidth={2} /> {it}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.notes && (
            <p className="text-sm text-brand-text-soft italic border-l-2 border-brand-primary/40 pl-4">
              Note: {result.notes}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
