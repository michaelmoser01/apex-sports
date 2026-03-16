import type { HTMLAttributes, ReactNode } from "react";

type Variant = "default" | "elevated" | "dark" | "feature" | "glass";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  hover?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  default: "bg-white border border-slate-200",
  elevated: "bg-white border border-slate-200 shadow-md",
  dark: "bg-slate-900 border border-slate-800 text-white",
  feature:
    "bg-white border border-slate-200 ring-1 ring-brand-500/10",
  glass: "bg-white/10 backdrop-blur-md border border-white/20 text-white",
};

const paddings: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Card({
  variant = "default",
  hover = false,
  padding = "md",
  children,
  className = "",
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        "rounded-2xl transition-all duration-300",
        variants[variant],
        paddings[padding],
        hover && "hover-lift cursor-pointer",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
