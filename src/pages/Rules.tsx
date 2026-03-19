import { useState } from "react";

type RulesMode = "ai" | "people";
type AiDifficulty = "beginner" | "intermediate" | "insane";

export default function Rules({
  mode,
  onBack,
  onStartAI,
}: {
  mode: RulesMode;
  onBack: () => void;
  onStartAI?: (difficulty: AiDifficulty) => void;
}) {
  const [difficulty, setDifficulty] = useState<AiDifficulty>("intermediate");
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
        {mode === "ai" ? (
          <>
            <div className="font-semibold">Quick Rules</div>
            <div className="mt-2 space-y-2 text-slate-300">
              <div>- Match by color or value.</div>
              <div>
                - If you can't play, draw until you have a playable card.
              </div>
              <div>- Wild/Wild4 set the color.</div>
              <div>- Call UNO at 1 card or draw 2.</div>
              <div>
                - If AI has one card, make sure to click UNO(AI), so it draws 2
              </div>
              <div>- RPS (Rock, Paper, Scissors): loser draws 4.</div>
              <div>- Heads/Tails: loser draws 3.</div>
            </div>
            <div className="mt-4 font-semibold">Shortcuts</div>
            <div className="mt-2 space-y-2 text-slate-300">
              <div>- D: Draw</div>
              <div>- U: Call UNO</div>
              <div>- C: Call UNO on opponent</div>
            </div>
          </>
        ) : (
          <>
            <div className="font-semibold">Core Rules</div>
            <div className="mt-2 space-y-2 text-slate-300">
              <div>- Match by color or value to play.</div>
              <div>
                - Wild and Wild4 can be played anytime and choose a color.
              </div>
              <div>- Skip: next player loses a turn.</div>
              <div>- Reverse: in 2-player, acts like Skip.</div>
              <div>- Draw2: next player can stack another Draw2.</div>
              <div>
                - If a Draw2 stack ends, the next player draws the stack total.
              </div>
              <div>- Wild4: next player draws 4 and is skipped.</div>
              <div>
                - If you can't play, draw one. If playable, you may play it.
              </div>
            </div>
            <div className="mt-4 font-semibold">UNO Call</div>
            <div className="mt-2 space-y-2 text-slate-300">
              <div>- When you have 1 card, you must press UNO.</div>
              <div>
                - If you don't, the opponent can call UNO on you and you draw 2.
              </div>
            </div>
            <div className="mt-4 font-semibold">Special Cards</div>
            <div className="mt-2 space-y-2 text-slate-300">
              <div>
                - RPS: both players play Rock/Paper/Scissors. If the thrower
                wins, they win the game. Otherwise, the loser draws 4.
              </div>
              <div>
                - Heads/Tails: thrower picks a side. If correct, opponent draws
                3. If wrong, thrower draws 3.
              </div>
            </div>
            <div className="mt-4 font-semibold">Shortcuts</div>
            <div className="mt-2 space-y-2 text-slate-300">
              <div>- D: Draw</div>
              <div>- U: Call UNO</div>
              <div>- C: Call UNO on opponent</div>
            </div>
          </>
        )}
      </div>
      {mode === "ai" && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-200">
          <div className="font-semibold">AI Difficulty</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: "Beginner (Noob lol)", value: "beginner" },
              { label: "Intermediate", value: "intermediate" },
              { label: "Insane", value: "insane" },
            ].map((option) => (
              <button
                key={option.value}
                className={`rounded-md px-3 py-2 text-xs font-semibold ${
                  difficulty === option.value
                    ? option.value === "beginner"
                      ? "bg-emerald-500 text-slate-950"
                      : option.value === "intermediate"
                        ? "bg-amber-400 text-slate-950"
                        : "bg-rose-500 text-slate-50"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
                onClick={() => setDifficulty(option.value as AiDifficulty)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
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
            onClick={() => onStartAI?.(difficulty)}
          >
            Start vs AI
          </button>
        )}
      </div>
    </div>
  );
}
