import { Link } from "react-router-dom";
import { Sparkles, Camera, ChefHat, Heart, Leaf, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";

const FAQS = [
  {
    q: "Is Manifeast free?",
    a: "Yes — scanning your fridge and getting recipe ideas is completely free. No account needed.",
  },
  {
    q: "Do you store my fridge photos?",
    a: "We only use your photo once to identify ingredients, and we don't keep the image. Your ingredient list lives only in your browser.",
  },
  {
    q: "What if the AI misses an ingredient?",
    a: "Just tap a chip to remove it, or switch to manual mode and add any item by typing. You stay in control.",
  },
  {
    q: "Can I save recipes for later?",
    a: "Tap the heart on any recipe to add it to your Saved tab. They stick around between visits.",
  },
  {
    q: "Where does the shopping list go?",
    a: "It stays in your browser. From the Shop tab you can send the whole list to Tesco, Sainsbury's, Lidl, Ocado, Amazon Fresh, or US grocers like Instacart and Walmart in one tap.",
  },
];

const VALUES = [
  {
    icon: Sparkles,
    title: "Less staring, more cooking",
    text: "We obsess over the moment between opening the fridge and starting the pan. Manifeast collapses that into seconds.",
  },
  {
    icon: Leaf,
    title: "Use what you have",
    text: "Every recipe is built around what's already in your kitchen — so fewer ingredients head for the bin, and your wallet thanks you.",
  },
  {
    icon: Heart,
    title: "Cook with confidence",
    text: "Clear steps, real timings, honest difficulty. Cook mode keeps you focused with one giant step at a time.",
  },
];

export default function About() {
  return (
    <div className="space-y-24 md:space-y-32" data-testid="about-page">
      {/* HERO */}
      <section className="space-y-7 max-w-3xl animate-fade-up pt-4 md:pt-8">
        <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
          About Manifeast
        </p>
        <h1 className="font-serif-display text-5xl sm:text-6xl lg:text-7xl leading-[1.02] font-medium text-balance text-brand-text">
          We turn what you have into <em className="italic text-brand-primary">what you want for dinner.</em>
        </h1>
        <p className="text-lg md:text-xl text-brand-text-soft leading-relaxed max-w-2xl">
          Manifeast is a tiny tool with a big mission: kill the &ldquo;what&rsquo;s for dinner?&rdquo;
          spiral. Point your camera at the fridge — we&rsquo;ll show you three to five real meals
          you can make right now, with the time, the difficulty, the calories, and a tidy
          shopping list for anything missing.
        </p>
      </section>

      <div className="editorial-divider" />

      {/* MANIFESTO */}
      <section className="grid md:grid-cols-5 gap-10 md:gap-16">
        <div className="md:col-span-2 space-y-3">
          <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
            Why we built it
          </p>
          <h2 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text leading-tight">
            A modest fight against the 6pm slump.
          </h2>
        </div>
        <div className="md:col-span-3 space-y-5 text-brand-text leading-relaxed text-lg">
          <p>
            We open the fridge an average of twenty times a day &mdash; not because we&rsquo;re
            hungry, but because we&rsquo;re hoping a meal idea will appear. It rarely does.
          </p>
          <p>
            Meanwhile, the average household throws out the equivalent of a full bag of groceries
            every week. A wilted herb here, an overripe avocado there &mdash; small losses that
            add up.
          </p>
          <p>
            Manifeast tries to fix both at once: <span className="text-brand-primary font-medium">use what you already
            have, before it goes off, in something genuinely worth eating.</span>
          </p>
        </div>
      </section>

      {/* VALUES */}
      <section className="space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
            What we care about
          </p>
          <h2 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
            Three quiet principles.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {VALUES.map((v, i) => {
            const Icon = v.icon;
            return (
              <div
                key={v.title}
                data-testid={`value-card-${i}`}
                className="bg-white border border-brand-line rounded-3xl p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="w-12 h-12 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center mb-5">
                  <Icon className="w-5 h-5" strokeWidth={1.7} />
                </div>
                <h3 className="font-serif-display text-2xl font-medium text-brand-text mb-2">
                  {v.title}
                </h3>
                <p className="text-brand-text-soft text-sm leading-relaxed">{v.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* HOW IT WORKS — recap */}
      <section className="grid md:grid-cols-2 gap-10 md:gap-16 items-start">
        <div className="space-y-4">
          <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
            Under the hood
          </p>
          <h2 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text leading-tight">
            Smart vision. Honest cooking.
          </h2>
          <p className="text-brand-text-soft leading-relaxed">
            We use a state-of-the-art vision model to read the contents of your fridge from a
            single photo, then a recipe assistant to suggest meals that actually use what it
            found. We treat pantry basics (oil, salt, herbs, garlic) as already-yours, so the
            &ldquo;missing&rdquo; list stays short and realistic.
          </p>
          <p className="text-brand-text-soft leading-relaxed">
            There&rsquo;s no signup, no tracking, no algorithm-feed. Your fridge contents, your
            saved recipes, and your shopping list all live in your browser &mdash; not on
            our servers.
          </p>
        </div>
        <div className="bg-white border border-brand-line rounded-3xl p-6 md:p-8 space-y-4">
          {[
            { n: "01", Icon: Camera, t: "Snap your fridge.", s: "One photo. Or type ingredients by hand." },
            { n: "02", Icon: Sparkles, t: "We read the shelves.", s: "Eggs, that lonely tomato, the half packet of pasta." },
            { n: "03", Icon: ChefHat, t: "Cook something real.", s: "3–5 meals with time, difficulty, calories, and steps." },
          ].map((s) => (
            <div key={s.n} className="flex gap-5 items-start py-3 border-b border-brand-line last:border-b-0">
              <span className="font-serif-display text-3xl italic text-brand-primary/70 w-12 leading-none">
                {s.n}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <s.Icon className="w-4 h-4 text-brand-primary" strokeWidth={1.7} />
                  <h4 className="font-semibold text-brand-text">{s.t}</h4>
                </div>
                <p className="text-sm text-brand-text-soft">{s.s}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-10">
        <div className="space-y-3">
          <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-primary">
            Questions
          </p>
          <h2 className="font-serif-display text-4xl md:text-5xl font-medium text-brand-text">
            The honest answers.
          </h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6 md:gap-10">
          {FAQS.map((f, i) => (
            <div key={f.q} data-testid={`faq-${i}`} className="space-y-2">
              <h3 className="font-serif-display text-2xl font-medium text-brand-text leading-snug">
                {f.q}
              </h3>
              <p className="text-brand-text-soft leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA BAND */}
      <section className="rounded-[2rem] bg-brand-text text-white px-7 md:px-14 py-12 md:py-16 grain relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-brand-primary/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-56 h-56 rounded-full bg-brand-accent/20 blur-3xl" />
        <div className="relative grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-5">
            <p className="text-xs tracking-[0.22em] uppercase font-semibold text-brand-accent">
              That&rsquo;s the whole story.
            </p>
            <h2 className="font-serif-display text-4xl md:text-5xl font-medium leading-tight">
              Now go open the fridge.
            </h2>
            <p className="text-white/70 max-w-md">
              The kettle won&rsquo;t answer what&rsquo;s for dinner. Manifeast will.
            </p>
          </div>
          <div className="flex md:justify-end">
            <Link to="/scan">
              <Button
                data-testid="about-cta-btn"
                className="rounded-full px-7 py-6 text-base font-semibold bg-white text-brand-text hover:bg-brand-accent transition-colors"
              >
                Start with a photo <ArrowRight className="w-4 h-4 ml-2" strokeWidth={1.8} />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer note */}
      <section className="text-center text-sm text-brand-text-soft space-y-2">
        <p>Made with care in Ireland 🇮🇪 &middot; <span className="text-brand-primary">manifeast.ie</span></p>
      </section>
    </div>
  );
}
