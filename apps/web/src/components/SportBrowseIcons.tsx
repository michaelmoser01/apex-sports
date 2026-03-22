const SPORT_IMAGES: Record<string, string> = {
  Soccer: "/images/soccer.svg",
  Baseball: "/images/baseball.svg",
  Softball: "/images/softball.svg",
  Basketball: "/images/basketball.svg",
  Tennis: "/images/tennis.svg",
};

export function SportBrowseIcon({
  sport,
  className,
}: {
  sport: string;
  className?: string;
}) {
  const src = SPORT_IMAGES[sport];
  if (!src) return null;
  return <img src={src} alt={sport} className={className} draggable={false} />;
}
