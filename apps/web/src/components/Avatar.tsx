/**
 * Avatar with optional image; falls back to initials in a colored circle.
 * Uses a stable hash of displayName for placeholder background color.
 */
function hashDisplayName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const PLACEHOLDER_COLORS = [
  "bg-brand-500/90 text-white",
  "bg-emerald-500/90 text-white",
  "bg-amber-500/90 text-white",
  "bg-sky-500/90 text-white",
  "bg-violet-500/90 text-white",
  "bg-rose-500/90 text-white",
];

function getInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0].charAt(0);
    const last = parts[parts.length - 1].charAt(0);
    return (first + last).toUpperCase().slice(0, 2);
  }
  return trimmed.slice(0, 2).toUpperCase();
}

const sizeClasses = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-lg",
  xl: "w-16 h-16 text-xl",
} as const;

export interface AvatarProps {
  src?: string | null;
  displayName: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function Avatar({ src, displayName, size = "md", className = "" }: AvatarProps) {
  const sizeClass = sizeClasses[size];
  const initials = getInitials(displayName);
  const colorIndex = hashDisplayName(displayName) % PLACEHOLDER_COLORS.length;
  const placeholderClass = PLACEHOLDER_COLORS[colorIndex];

  if (src && src.trim()) {
    return (
      <img
        src={src}
        alt=""
        className={`rounded-full object-cover shrink-0 ${sizeClass} ${className}`}
      />
    );
  }

  return (
    <span
      className={`rounded-full shrink-0 inline-flex items-center justify-center font-semibold ${sizeClass} ${placeholderClass} ${className}`}
      aria-hidden
    >
      {initials}
    </span>
  );
}
