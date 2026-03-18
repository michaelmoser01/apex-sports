import { Heart } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface FavoriteButtonProps {
  coachProfileId: string;
  isFavorite: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function FavoriteButton({ coachProfileId, isFavorite, size = "md", className = "" }: FavoriteButtonProps) {
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: () =>
      api(`/athletes/me/favorites/${coachProfileId}`, {
        method: isFavorite ? "DELETE" : "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favoriteIds"] });
      queryClient.invalidateQueries({ queryKey: ["myCoaches"] });
    },
  });

  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const padding = size === "sm" ? "p-1.5" : "p-2";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleMutation.mutate();
      }}
      disabled={toggleMutation.isPending}
      className={`${padding} rounded-full transition-colors ${
        isFavorite
          ? "text-rose-500 hover:text-rose-600 hover:bg-rose-50"
          : "text-slate-300 hover:text-rose-400 hover:bg-slate-50"
      } disabled:opacity-50 ${className}`}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      <Heart className={`${iconSize} ${isFavorite ? "fill-current" : ""}`} />
    </button>
  );
}
