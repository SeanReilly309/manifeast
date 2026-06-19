import { Link } from "react-router-dom";
import { Camera, PencilLine, Sparkles, Clock, ShoppingBasket } from "lucide-react";
import { Button } from "../components/ui/button";

const HERO_IMG =
  "https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=900";

export default function Home() {
  return (
    <div className="space-y-20 md:space-y-28" data-testid="home-page">
      {/* HERO */}
      <section className="grid md:grid-cols-2 gap-10 md:gap-16 items-center pt-4 md:pt-8">
        <div className="space-y-7 animate-fade-up">
          <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
            No more &ldquo;what&rsquo;s for dinner?&rdquo;
          </p>
          <h1 className="font-serif-display text-5xl sm:text-6xl lg:text-7xl leading-[1.02] font-medium text-balance text-brand-text">
            Snap your fridge.<br />
            <span className="italic text-brand-primary">Cook something</span> tonight.
          </h1>
          <p className="text-base md:text-lg text-brand-text-soft max-w-md leading-relaxed">
            Point your camera at what you have. We&rsquo;ll show you three to five real
            meals you can make right now &mdash; no more endless scrolling.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link to="/scan">
              <Button
                data-testid="hero-take-photo-btn"
                className="rounded-full px-7 py-6 text-base font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white shadow-[0_8px_24px_rgba(224,122,95,0.32)] transition-all hover:-translate-y-0.5"
              >
                <Camera className="w-5 h-5 mr-2" strokeWidth={1.7} />
                Take fridge photo
              </Button>
            </Link>
            <Link to="/scan?mode=manual">
              <Button
                data-testid="hero-manual-btn"
                variant="outline"
                className="rounded-full px-7 py-6 text-base font-semibold border-brand-text/15 text-brand-text bg-transparent hover:bg-brand-line/40"
              >
                <PencilLine className="w-5 h-5 mr-2" strokeWidth={1.7} />
                Add ingredients manually
              </Button>
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -top-6 -left-6 w-32 h-32 rounded-full bg-brand-accent/30 blur-3xl" />
          <div className="absolute -bottom-6 -right-6 w-44 h-44 rounded-full bg-brand-secondary/20 blur-3xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-brand-line shadow-[0_20px_60px_-30px_rgba(45,48,71,0.35)]">
            <img
              src={HERO_IMG}
              alt="Fresh ingredients ready to cook"
              className="w-full h-[420px] md:h-[520px] object-cover"
            />
            <div className="absolute bottom-5 left-5 right-5 bg-white/85 backdrop-blur-md border border-white/60 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-primary/15 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-brand-primary" strokeWidth={1.7} />
              </div>
              <div className="text-sm">
                <div className="font-semibold text-brand-text">3–5 meal ideas in seconds</div>
                <div className="text-xs text-brand-text-soft">Powered by smart vision</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
            How it works
          </p>
          <h2 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
            From fridge to fork in three steps.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {[
            {
              n: "01",
              icon: Camera,
              title: "Snap or type",
              text: "Take one photo of your fridge, or quickly add what you have by hand.",
            },
            {
              n: "02",
              icon: Sparkles,
              title: "We read the shelf",
              text: "Our AI spots the ingredients \u2014 eggs, pasta, that lonely tomato \u2014 in seconds.",
            },
            {
              n: "03",
              icon: Clock,
              title: "Real meals appear",
              text: "Get 3 to 5 doable meals with time, difficulty, and missing items for your list.",
            },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.n}
                data-testid={`step-card-${i}`}
                className="group bg-white border border-brand-line rounded-3xl p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex items-start justify-between mb-6">
                  <span className="font-serif-display text-4xl text-brand-primary/30 italic">{s.n}</span>
                  <div className="w-11 h-11 rounded-full bg-brand-primary/10 flex items-center justify-center group-hover:bg-brand-primary group-hover:text-white transition-colors text-brand-primary">
                    <Icon className="w-5 h-5" strokeWidth={1.6} />
                  </div>
                </div>
                <h3 className="font-serif-display text-2xl font-medium text-brand-text mb-2">
                  {s.title}
                </h3>
                <p className="text-brand-text-soft text-sm leading-relaxed">{s.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* BONUS BAND */}
      <section className="rounded-[2rem] bg-brand-text text-white px-7 md:px-14 py-12 md:py-16 grain relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-brand-primary/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-56 h-56 rounded-full bg-brand-accent/20 blur-3xl" />
        <div className="relative grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-5">
            <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-accent">
              Missing a thing or two?
            </p>
            <h2 className="font-serif-display text-4xl md:text-5xl font-medium leading-tight">
              We&rsquo;ll save it to your shopping list, automatically.
            </h2>
            <p className="text-white/70 max-w-md">
              Tap &ldquo;Add to shopping list&rdquo; on any recipe and we&rsquo;ll keep a tidy
              checklist for your next grocery run.
            </p>
            <Link to="/scan">
              <Button
                data-testid="cta-band-start-btn"
                className="rounded-full px-7 py-6 text-base font-semibold bg-white text-brand-text hover:bg-brand-accent transition-colors mt-2"
              >
                Start with a photo
              </Button>
            </Link>
          </div>
          <div className="bg-white/8 backdrop-blur-sm border border-white/15 rounded-3xl p-6 space-y-3">
            {[
              { name: "olive oil", checked: true },
              { name: "garlic", checked: true },
              { name: "double cream", checked: false },
              { name: "parmesan", checked: false },
            ].map((s) => (
              <div key={s.name} className="flex items-center gap-3 text-base">
                <span
                  className={`w-5 h-5 rounded-full border-2 ${
                    s.checked ? "bg-brand-secondary border-brand-secondary" : "border-white/40"
                  } flex items-center justify-center text-[10px]`}
                >
                  {s.checked ? "✓" : ""}
                </span>
                <span className={s.checked ? "line-through text-white/45" : "text-white"}>
                  {s.name}
                </span>
                <ShoppingBasket className="w-4 h-4 ml-auto text-white/40" strokeWidth={1.5} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
