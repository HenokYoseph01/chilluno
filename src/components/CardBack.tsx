import { motion } from "framer-motion";

export default function CardBack({ label = "CHILLNO" }: { label?: string }) {
  return (
    <motion.div className="game-card card-back" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -4, rotate: 1 }}>
      <div className="card-back__orbit" />
      <div className="card-back__brand">C</div>
      <div className="card-back__label">{label}</div>
    </motion.div>
  );
}
