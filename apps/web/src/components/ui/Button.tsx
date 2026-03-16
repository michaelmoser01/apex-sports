import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "dark" | "ghost" | "danger" | "glass";
type Size = "sm" | "md" | "lg" | "xl";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

const base =
  "inline-flex items-center justify-center font-semibold transition-all duration-200 ease-out rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-500 text-white hover:bg-brand-600 hover:shadow-glow-brand focus:ring-brand-500 active:scale-[0.98]",
  secondary:
    "bg-white text-slate-900 border border-slate-200 hover:border-slate-300 hover:shadow-md focus:ring-slate-400 active:scale-[0.98]",
  dark:
    "bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-500 active:scale-[0.98]",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-400",
  danger:
    "bg-danger-500 text-white hover:bg-danger-600 focus:ring-danger-500 active:scale-[0.98]",
  glass:
    "bg-white/10 backdrop-blur-md text-white border border-white/25 hover:bg-white/20 focus:ring-white/50 active:scale-[0.98]",
};

const sizes: Record<Size, string> = {
  sm: "text-sm px-3.5 py-2 gap-1.5",
  md: "text-sm px-5 py-2.5 gap-2",
  lg: "text-base px-6 py-3 gap-2.5",
  xl: "text-lg px-8 py-4 gap-3",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      icon,
      iconRight,
      loading,
      children,
      className = "",
      disabled,
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <svg
          className="animate-spin -ml-0.5 h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        icon
      )}
      {children}
      {iconRight}
    </button>
  ),
);

Button.displayName = "Button";
export { Button };
export type { ButtonProps };
