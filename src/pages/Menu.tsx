import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "../components/Card";

export default function Menu({ onSelectAI, onSelectOnline, onSelectPeopleRules }: { onSelectAI: () => void; onSelectOnline: () => void; onSelectPeopleRules: () => void }) {
  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => { const timer = window.setTimeout(() => setShowSplash(false), 1500); return () => window.clearTimeout(timer); }, []);
  return (
    <div className="relative mx-auto flex min-h-screen max-w-6xl items-center overflow-hidden px-5 py-12">
      <AnimatePresence>{showSplash && <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080711]" exit={{ opacity: 0 }} transition={{ duration: .45 }}><motion.div initial={{ scale:.8, opacity:0 }} animate={{ scale:1, opacity:1 }} exit={{ scale:1.15, opacity:0 }} className="text-center"><div className="eyebrow">The table is open</div><div className="display-font mt-2 text-5xl font-black">CHILL<span className="text-[#b8f36b]">NO</span></div></motion.div></motion.div>}</AnimatePresence>
      <motion.div className="pointer-events-none absolute -right-24 top-10 h-80 w-80 rounded-full bg-violet-600/15 blur-[90px]" animate={{ scale:[1,1.15,1], y:[0,24,0] }} transition={{ duration:8, repeat:Infinity }} />
      <div className="grid w-full items-center gap-14 lg:grid-cols-[1.05fr_.95fr]">
        <motion.main initial={{ opacity:0, x:-28 }} animate={{ opacity:1, x:0 }} transition={{ duration:.65 }}>
          <div className="eyebrow">A card game with main-character energy</div>
          <h1 className="mt-5 max-w-2xl text-6xl font-black leading-[.92] tracking-[-.06em] sm:text-7xl lg:text-8xl">PLAY LOUD.<br/><span className="bg-gradient-to-r from-[#b8f36b] via-[#dbffab] to-[#ffb071] bg-clip-text text-transparent">STAY CHILL.</span></h1>
          <p className="mt-7 max-w-lg text-base leading-7 text-slate-300">Classic color chaos, unfair friendships, and just enough luck to demand one more round.</p>
          <div className="mt-9 flex flex-wrap gap-3"><motion.button whileTap={{ scale:.96 }} className="primary-button px-7 py-4" onClick={onSelectOnline}>Play with friends <span className="ml-2">↗</span></motion.button><motion.button whileTap={{ scale:.96 }} className="secondary-button px-7 py-4 font-semibold" onClick={onSelectAI}>Challenge the bot</motion.button></div>
          <button className="mt-6 text-sm font-semibold text-slate-400 transition hover:text-white" onClick={onSelectPeopleRules}>How to play <span className="ml-1">→</span></button>
          <div className="mt-12 flex gap-8 border-t border-white/10 pt-6 text-xs text-slate-500"><span><b className="text-slate-200">2–4</b> players</span><span><b className="text-slate-200">5 min</b> rounds</span><span><b className="text-slate-200">∞</b> grudges</span></div>
        </motion.main>
        <motion.div className="relative hidden h-[560px] lg:block" initial={{ opacity:0, scale:.9 }} animate={{ opacity:1, scale:1 }} transition={{ delay:.15, duration:.7 }}>
          <div className="glass-panel absolute inset-8 rounded-[3rem] rotate-3" />
          <motion.div className="absolute left-20 top-20 rotate-[-14deg]" animate={{ y:[0,-16,0], rotate:[-14,-10,-14] }} transition={{ duration:4.8, repeat:Infinity }}><Card color="red" value="Draw2" /></motion.div>
          <motion.div className="absolute right-20 top-32 rotate-[16deg]" animate={{ y:[0,14,0], rotate:[16,12,16] }} transition={{ duration:5.5, repeat:Infinity }}><Card color="wild" value="RPS" /></motion.div>
          <motion.div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-[1.8]" animate={{ rotate:[-3,3,-3], y:[-6,6,-6] }} transition={{ duration:6, repeat:Infinity }}><Card color="blue" value={7} /></motion.div>
          <div className="absolute bottom-14 left-1/2 w-max -translate-x-1/2 rounded-full border border-white/10 bg-black/30 px-5 py-3 text-xs font-semibold text-slate-300 backdrop-blur"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#b8f36b] shadow-[0_0_14px_#b8f36b]"/>Tables are filling up</div>
        </motion.div>
      </div>
    </div>
  );
}
