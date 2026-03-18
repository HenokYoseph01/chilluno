export default function CardBack({ label = "UNO" }: { label?: string }) {
  return (
    <div className="h-24 w-16 rounded-lg border-2 border-black/20 bg-slate-800 shadow-sm">
      <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-200">
        {label}
      </div>
    </div>
  );
}
