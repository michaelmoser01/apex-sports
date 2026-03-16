import type { ReactNode } from "react";

type StatusVariant = "confirmed" | "completed" | "cancelled" | "pending" | "paid" | "unpaid";
type TagVariant = "sport" | "neutral" | "brand";

interface BadgeProps {
  variant?: StatusVariant | TagVariant;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const styles: Record<StatusVariant | TagVariant, string> = {
  confirmed: "bg-success-100 text-success-700 ring-1 ring-success-600/10",
  completed: "bg-slate-100 text-slate-700 ring-1 ring-slate-600/10",
  cancelled: "bg-danger-100 text-danger-700 ring-1 ring-danger-600/10",
  pending: "bg-amber-100 text-amber-700 ring-1 ring-amber-600/10",
  paid: "bg-success-100 text-success-700 ring-1 ring-success-600/10",
  unpaid: "bg-amber-100 text-amber-800 ring-1 ring-amber-600/10",
  sport: "bg-brand-50 text-brand-700 ring-1 ring-brand-500/10",
  neutral: "bg-slate-100 text-slate-600 ring-1 ring-slate-400/10",
  brand: "bg-brand-500 text-white",
};

export function Badge({
  variant = "neutral",
  icon,
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${styles[variant]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
