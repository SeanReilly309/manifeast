import { Flame, Thermometer, Clock } from "lucide-react";

const chip = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold";

export const heatText = (heat) =>
  heat ? `${heat.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase())} heat` : "";

// "200°C · 180°C fan" for oven steps so conventional and fan ovens are both covered.
export const tempText = (tempC, instruction = "") =>
  /oven|bake|roast/i.test(instruction) && tempC > 60 ? `${tempC}°C · ${tempC - 20}°C fan` : `${tempC}°C`;

export const StepMeta = ({ step, testid }) => {
  const { heat, temperature_c: t, duration_minutes: d, instruction = "" } = step || {};
  if (!heat && !(t > 0) && !(d > 0)) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-2" data-testid={testid}>
      {heat && (
        <span className={`${chip} bg-brand-primary/10 text-brand-primary`} data-testid={`${testid}-heat`}>
          <Flame className="w-3.5 h-3.5" strokeWidth={2} /> {heatText(heat)}
        </span>
      )}
      {t > 0 && (
        <span className={`${chip} bg-brand-secondary/15 text-brand-secondary-dark`} data-testid={`${testid}-temp`}>
          <Thermometer className="w-3.5 h-3.5" strokeWidth={2} /> {tempText(t, instruction)}
        </span>
      )}
      {d > 0 && (
        <span className={`${chip} bg-brand-accent/40 text-brand-text`} data-testid={`${testid}-duration`}>
          <Clock className="w-3.5 h-3.5" strokeWidth={2} /> {d} min
        </span>
      )}
    </div>
  );
};
