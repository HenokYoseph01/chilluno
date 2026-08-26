import { motion } from "framer-motion";
import type { CardValue, Color } from "../types/cards";

interface CardProps { color: Color; value: CardValue; compact?: boolean }

const symbols: Partial<Record<CardValue, string>> = {
  Skip: "⊘", Reverse: "↻", Draw2: "+2", Wild: "✦",
  Wild4: "+4", RPS: "✊", HT: "◐",
};
const labels: Partial<Record<CardValue, string>> = {
  Wild: "WILD", Wild4: "WILD", RPS: "BATTLE", HT: "FLIP",
};

const Card = ({ color, value, compact = false }: CardProps) => {
  const colorClass = color === "red" ? "card-red" : color === "yellow" ? "card-yellow" : color === "green" ? "card-green" : color === "blue" ? "card-blue" : "card-wild";
  const display = symbols[value] ?? value;
  return (
    <motion.div className={`game-card ${compact ? "game-card--compact" : ""} ${colorClass}`}
      whileHover={{ y: -7, rotate: -1.5, scale: 1.04 }} whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}>
      <span className="game-card__corner">{display}</span>
      <div className="game-card__mark"><span>{display}</span>{labels[value] && <small>{labels[value]}</small>}</div>
      <span className="game-card__corner game-card__corner--bottom">{display}</span>
      <span className="game-card__shine" />
    </motion.div>
  );
};
export default Card;
