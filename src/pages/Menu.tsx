export default function Menu({
  onSelectAI,
  onSelectOnline,
  onSelectPeopleRules,
}: {
  onSelectAI: () => void;
  onSelectOnline: () => void;
  onSelectPeopleRules: () => void;
}) {
  return (
    <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-6 overflow-hidden px-4 text-center">
      <div className="pointer-events-none absolute -top-10 right-10 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 left-10 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">
        Chill Coding Lounge
      </div>
      <div className="text-5xl font-black tracking-tight text-slate-100">
        Chillno
      </div>
      <div className="max-w-xl text-sm text-slate-300">
        Cozy vibes, competitive turns. Grab a seat, pick a mode, and let the
        cards talk.
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          className="rounded-md bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
          onClick={onSelectAI}
        >
          Play vs AI
        </button>
        <div className="flex flex-col items-center gap-2 sm:items-stretch">
          <button
            className="rounded-md bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400"
            onClick={onSelectOnline}
          >
            Play Online
          </button>
          <button
            className="rounded-md border border-emerald-400/40 px-4 py-2 text-xs text-emerald-200 hover:bg-emerald-500/10"
            onClick={onSelectPeopleRules}
          >
            View Rules
          </button>
        </div>
      </div>
    </div>
  );
}
