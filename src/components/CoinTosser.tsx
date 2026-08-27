export default function CoinTosser({ active, landed = false, className = "" }: { active: boolean; landed?: boolean; className?: string }) {
  return (
    <div
      className={`coin-tosser ${active ? "coin-tosser--active" : landed ? "coin-tosser--landed" : ""} ${className}`}
      role="img"
      aria-label={active ? "Chill Guy tossing a coin" : "Chill Guy holding a coin"}
    />
  );
}
