export function StarRating({ rating, className }: { rating: number; className?: string }) {
  const value = Math.min(5, Math.max(0, Number(rating)));
  const pct = (value / 5) * 100;
  return (
    <span
      className={`inline-flex relative text-lg ${className ?? ""}`}
      style={{ width: "5em" }}
      role="img"
      aria-label={`${value.toFixed(1)} out of 5 stars`}
    >
      <span className="text-slate-300" aria-hidden>
        ★★★★★
      </span>
      <span
        className="absolute left-0 top-0 overflow-hidden text-amber-500"
        style={{ width: `${pct}%` }}
        aria-hidden
      >
        ★★★★★
      </span>
    </span>
  );
}
