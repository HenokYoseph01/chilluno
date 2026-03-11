export default function Menu({
  onSelectAI,
  onSelectPeopleRules,
}: {
  onSelectAI: () => void;
  onSelectPeopleRules: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="text-xs uppercase tracking-widest text-slate-400">
        UNO Clone
      </div>
      <div className="text-4xl font-semibold">Choose a mode</div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          className="rounded-md bg-emerald-600 px-4 py-3 text-sm text-white hover:bg-emerald-500"
          onClick={onSelectAI}
        >
          Play vs AI
        </button>
        <div className="flex flex-col items-center gap-2 sm:items-stretch">
          <button
            className="rounded-md bg-slate-800 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700"
            disabled
          >
            Play vs People (Soon)
          </button>
          <button
            className="rounded-md border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
            onClick={onSelectPeopleRules}
          >
            View Rules
          </button>
        </div>
      </div>
    </div>
  );
}
