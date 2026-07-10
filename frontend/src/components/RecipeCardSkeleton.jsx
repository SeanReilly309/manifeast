export function RecipeCardSkeleton() {
  return (
    <div
      data-testid="recipe-card-skeleton"
      className="rounded-3xl bg-white border border-brand-line overflow-hidden animate-pulse"
    >
      <div className="aspect-[4/3] bg-brand-line/50" />
      <div className="p-5 space-y-3">
        <div className="h-4 w-3/4 bg-brand-line/70 rounded" />
        <div className="h-3 w-full bg-brand-line/50 rounded" />
        <div className="h-3 w-5/6 bg-brand-line/50 rounded" />
        <div className="flex gap-2 pt-2">
          <div className="h-6 w-16 bg-brand-line/40 rounded-full" />
          <div className="h-6 w-20 bg-brand-line/40 rounded-full" />
          <div className="h-6 w-14 bg-brand-line/40 rounded-full" />
        </div>
      </div>
    </div>
  );
}
