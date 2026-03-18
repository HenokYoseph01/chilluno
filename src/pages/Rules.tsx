type RulesMode = "ai" | "people";

export default function Rules({
  mode,
  onBack,
  onStartAI,
}: {
  mode: RulesMode;
  onBack: () => void;
  onStartAI?: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-10">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">
          Chill Coding Lounge
        </div>
        <div className="text-3xl font-semibold">
          {mode === "ai" ? "Chillno Rules: vs AI" : "Chillno Rules: vs People"}
        </div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-200">
        <div className="font-semibold">Core Rules</div>
        <div className="mt-2 space-y-2 text-slate-300">
          <div>- Match by color or value to play.</div>
          <div>- Wild and Wild4 can be played anytime and choose a color.</div>
          <div>- Skip: next player loses a turn.</div>
          <div>- Reverse: in 2-player, acts like Skip.</div>
          <div>- Draw2: next player can stack another Draw2.</div>
          <div>- If a Draw2 stack ends, the next player draws the stack total.</div>
          <div>- Wild4: next player draws 4 and is skipped.</div>
          <div>- If you can't play, draw one. If playable, you may play it.</div>
        </div>
        <div className="mt-4 font-semibold">UNO Call</div>
        <div className="mt-2 space-y-2 text-slate-300">
          <div>- When you have 1 card, you must press UNO.</div>
          <div>- If you don't, the opponent can call UNO on you and you draw 2.</div>
        </div>
        <div className="mt-4 font-semibold">Special Cards</div>
        <div className="mt-2 space-y-2 text-slate-300">
          <div>
            - RPS: both players play Rock/Paper/Scissors. If the thrower wins,
            they win the game. Otherwise, the loser draws 4.
          </div>
          <div>
            - Heads/Tails: thrower picks a side. If correct, opponent draws 3.
            If wrong, thrower draws 3.
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="rounded-md bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
          onClick={onBack}
        >
          Back
        </button>
        {mode === "ai" && (
          <button
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500"
            onClick={onStartAI}
          >
            Start vs AI
          </button>
        )}
      </div>
    </div>
  );
}

