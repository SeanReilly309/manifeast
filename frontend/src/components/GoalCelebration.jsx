import { useApp } from "../context/AppContext";

const SPARKLES = [
  { emoji: "✨", left: "8%", delay: "0s", size: "36px" },
  { emoji: "🎉", left: "18%", delay: "0.15s", size: "44px" },
  { emoji: "✨", left: "30%", delay: "0.3s", size: "28px" },
  { emoji: "🥳", left: "42%", delay: "0.05s", size: "48px" },
  { emoji: "✨", left: "55%", delay: "0.25s", size: "32px" },
  { emoji: "🎉", left: "66%", delay: "0.1s", size: "42px" },
  { emoji: "✨", left: "76%", delay: "0.35s", size: "36px" },
  { emoji: "🥂", left: "88%", delay: "0.2s", size: "46px" },
];

export default function GoalCelebration() {
  const { celebrating } = useApp();
  if (!celebrating) return null;
  return (
    <div
      data-testid="goal-celebration"
      className="fixed inset-0 z-[100] pointer-events-none overflow-hidden"
      aria-hidden
    >
      {SPARKLES.map((s, i) => (
        <span
          key={i}
          className="absolute bottom-0 animate-celebration"
          style={{
            left: s.left,
            fontSize: s.size,
            animationDelay: s.delay,
          }}
        >
          {s.emoji}
        </span>
      ))}
    </div>
  );
}
