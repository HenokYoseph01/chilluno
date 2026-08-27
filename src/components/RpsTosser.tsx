export type RpsGesture = "rock" | "paper" | "scissors";

export default function RpsTosser({ choice = null, animate = false, compact = false }: { choice?: RpsGesture | null; animate?: boolean; compact?: boolean }) {
  return <div className={`rps-tosser ${choice ? `rps-tosser--${choice}` : ""} ${animate && choice ? "rps-tosser--active" : ""} ${compact ? "rps-tosser--compact" : ""}`} role="img" aria-label={choice ? `Chill Guy throws ${choice}` : "Chill Guy ready for rock paper scissors"} />;
}
