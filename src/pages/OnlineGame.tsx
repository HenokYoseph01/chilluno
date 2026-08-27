/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimation } from "framer-motion";
import Card from "../components/Card";
import CardBack from "../components/CardBack";
import type { deckOutline } from "../types/cards";
import type { ActivePublicState, ClientMessage, PublicPlayer } from "../types/online";
import { isPlayableForTurn } from "../../shared/rules.js";

const COLORS = ["red", "yellow", "green", "blue"] as const;

type VisualEffect = {
  id: number;
  type: "play" | "draw" | "skip" | "reverse" | "wild" | "uno";
  playerId: string;
  card?: deckOutline;
  count?: number;
};

function playerLabel(state: ActivePublicState, id: string) {
  return state.players.find((player) => player.id === id)?.name ?? "Player";
}

function seatPosition(index: number, total: number) {
  if (total === 1) return "seat-top";
  if (total === 2) return index === 0 ? "seat-top-left" : "seat-top-right";
  return index === 0 ? "seat-left" : index === 1 ? "seat-top" : "seat-right";
}

function PlayerSeat({ player, active, position, clock, reaction, onCallUno }: {
  player: PublicPlayer;
  active: boolean;
  position: string;
  clock: number;
  reaction?: { id: number; emoji: string };
  onCallUno: () => void;
}) {
  const seconds = player.reconnectDeadline
    ? Math.max(0, Math.ceil((player.reconnectDeadline - clock) / 1000))
    : null;
  return (
    <motion.div className={`player-seat ${position} ${active ? "player-seat--active" : ""} ${player.disconnected ? "player-seat--offline" : ""}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <AnimatePresence>{reaction && <motion.div key={reaction.id} className="player-seat__reaction" initial={{ opacity:0, scale:.35, y:12, rotate:-12 }} animate={{ opacity:1, scale:[.35,1.18,1], y:0, rotate:0 }} exit={{ opacity:0, scale:.7, y:-18 }}>{reaction.emoji}</motion.div>}</AnimatePresence>
      {active && <motion.div layoutId="active-seat" className="player-seat__turn"><span /> Playing</motion.div>}
      <div className="player-seat__cards" aria-label={`${player.handCount} hidden cards`}>
        {[0, 1, 2].slice(0, Math.min(3, player.handCount)).map((cardIndex) => <div key={cardIndex} style={{ transform: `translateX(${(cardIndex - 1) * 11}px) rotate(${(cardIndex - 1) * 7}deg)` }}><CardBack /></div>)}
      </div>
      <div className="player-seat__identity"><div className="player-seat__avatar">{player.name.slice(0, 1).toUpperCase()}</div><div><strong>{player.name}</strong><small>{player.disconnected ? `Reconnecting${seconds !== null ? ` · ${seconds}s` : ""}` : `${player.handCount} card${player.handCount === 1 ? "" : "s"}`}</small></div></div>
      {player.unoWindow && !player.unoCalled && <button className="player-seat__uno" onClick={onCallUno}>Call UNO!</button>}
      {player.handCount === 1 && player.unoCalled && <div className="player-seat__uno player-seat__uno--safe">UNO ✓</div>}
    </motion.div>
  );
}

function playImpactSound() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 160;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    oscillator.stop(ctx.currentTime + 0.2);
    oscillator.onended = () => ctx.close();
  } catch {
    // ignore audio errors (autoplay restrictions)
  }
}

function playGameSound(type: VisualEffect["type"], muted: boolean) {
  if (muted) return;
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const frequencies = { play: 330, draw: 210, skip: 120, reverse: 440, wild: 560, uno: 720 };
    oscillator.type = type === "uno" || type === "wild" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequencies[type], ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequencies[type] * 1.35, ctx.currentTime + .16);
    gain.gain.setValueAtTime(.035, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .2);
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .21);
    oscillator.onended = () => ctx.close();
  } catch { /* sound is optional */ }
}

export default function OnlineGame({
  state,
  hand,
  youId,
  send,
  onLeave,
}: {
  state: ActivePublicState;
  hand: deckOutline[];
  youId: string;
  send: (message: ClientMessage) => void;
  onLeave: () => void;
}) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [muted, setMuted] = useState(() => window.localStorage.getItem("chillno-muted") === "true");
  const [visualEffects, setVisualEffects] = useState<VisualEffect[]>([]);
  const [invalidCard, setInvalidCard] = useState<{ index: number; message: string } | null>(null);
  const [rpsSelection, setRpsSelection] = useState<"rock" | "paper" | "scissors" | null>(null);
  const [coinSelection, setCoinSelection] = useState<"heads" | "tails" | null>(null);
  const [rpsSubmitted, setRpsSubmitted] = useState(false);
  const [coinSubmitted, setCoinSubmitted] = useState(false);
  const [coinFlip, setCoinFlip] = useState<{
    active: boolean;
    result: "heads" | "tails" | null;
  }>({ active: false, result: null });
  const [coinFlipKey, setCoinFlipKey] = useState(0);
  const [coinImpactKey, setCoinImpactKey] = useState(0);
  const [showRules, setShowRules] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const lastChatIdRef = useRef<number | null>(null);
  const coinFlipTimer = useRef<number | null>(null);
  const coinFlipClearTimer = useRef<number | null>(null);
  const lastCoinEventIdRef = useRef<number | null>(null);
  const insult = useMemo(() => {
    if (!state.winnerId) return "";
    const pool = [
      "Skill issue.",
      "Get better, noob.",
      "Maybe after 1000 years.",
      "Stinky loser.",
      "My grandma plays better than you.",
      "That was... not it.",
      "Try turning your monitor on.",
    ];
    const seed = [...state.winnerId].reduce((total, character) => total + character.charCodeAt(0), 0);
    return pool[seed % pool.length];
  }, [state.winnerId]);
  const pileControls = useAnimation();
  const lastHistoryIdRef = useRef<number | null>(null);
  const lastWinnerRef = useRef<string | null>(null);
  const visualCounterRef = useRef(0);
  const lastVisualHistoryIdRef = useRef<number | null>(state.history.at(-1)?.id ?? null);
  const previousCountsRef = useRef(new Map(state.players.map((player) => [player.id, player.handCount])));
  const visualTimersRef = useRef<number[]>([]);

  const enqueueEffect = useCallback((effect: Omit<VisualEffect, "id">) => {
    const id = ++visualCounterRef.current;
    setVisualEffects((current) => [...current.slice(-5), { ...effect, id }]);
    playGameSound(effect.type, muted);
    const timer = window.setTimeout(() => {
      setVisualEffects((current) => current.filter((item) => item.id !== id));
      visualTimersRef.current = visualTimersRef.current.filter((timerId) => timerId !== timer);
    }, effect.type === "play" || effect.type === "draw" ? 850 : 1250);
    visualTimersRef.current.push(timer);
  }, [muted]);

  useEffect(() => () => visualTimersRef.current.forEach((timer) => window.clearTimeout(timer)), []);

  useEffect(() => {
    const latest = state.history.at(-1);
    if (latest && latest.id !== lastVisualHistoryIdRef.current) {
      lastVisualHistoryIdRef.current = latest.id;
      if (latest.type === "card") {
        enqueueEffect({ type: "play", playerId: latest.playerId, card: latest.card });
        if (latest.card.value === "Skip") enqueueEffect({ type: "skip", playerId: latest.playerId });
        if (latest.card.value === "Reverse") enqueueEffect({ type: "reverse", playerId: latest.playerId });
        if (latest.card.value === "Wild" || latest.card.value === "Wild4" || latest.card.value === "RPS" || latest.card.value === "HT") enqueueEffect({ type: "wild", playerId: latest.playerId, card: latest.card });
      } else if (latest.text.toLowerCase().includes("uno")) {
        const caller = state.players.find((player) => latest.text.includes(player.name));
        enqueueEffect({ type: "uno", playerId: caller?.id ?? state.currentPlayerId });
      }
    }

    for (const player of state.players) {
      const previous = previousCountsRef.current.get(player.id) ?? player.handCount;
      const gained = player.handCount - previous;
      if (gained > 0) {
        if (state.miniGameResult?.loserId === player.id) {
          const timer = window.setTimeout(() => enqueueEffect({ type: "draw", playerId: player.id, count: gained }), Math.max(0, state.miniGameResult.revealUntil - Date.now() + 80));
          visualTimersRef.current.push(timer);
        } else {
          enqueueEffect({ type: "draw", playerId: player.id, count: gained });
        }
      }
    }
    previousCountsRef.current = new Map(state.players.map((player) => [player.id, player.handCount]));
  }, [state.history, state.players, state.currentPlayerId, state.miniGameResult, enqueueEffect]);

  useEffect(() => {
    if (!state.players.some((player) => player.reconnectDeadline)) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state.players]);

  const topCard = useMemo(() => state.discardTop, [state.discardTop]);
  const you = state.players.find((player) => player.id === youId);
  const isYourTurn = state.currentPlayerId === youId;
  const pendingWild = state.pendingWild;
  const pendingMiniGame = state.pendingMiniGame;
  const playerHasPlayable = hand.some((card) =>
    isPlayableForTurn(card, topCard, state.pendingDraw2),
  );
  const canDraw = isYourTurn && !state.winnerId && !pendingWild && !pendingMiniGame && !state.miniGameResult && !playerHasPlayable;
  const opponents = state.players.filter((player) => player.id !== youId);
  const latestReaction = (playerId: string) => [...state.reactions].reverse().find((reaction) => reaction.playerId === playerId);
  const yourReaction = latestReaction(youId);
  const matchAwards = useMemo(() => {
    if (!state.matchWinnerId) return [];
    const leaders = (score: (stats: ActivePublicState["stats"][string]) => number, title: string, emoji: string) => {
      const ranked = state.players.map((player) => ({ player, value: score(state.stats[player.id]) })).sort((a, b) => b.value - a.value);
      return ranked[0]?.value > 0 ? { ...ranked[0], title, emoji } : null;
    };
    return [
      leaders((stats) => stats.cardsPlayed, "Table menace", "🔥"),
      leaders((stats) => stats.unoChallenges, "UNO police", "🚨"),
      leaders((stats) => stats.rpsWins + stats.coinWins, "Minigame boss", "🎲"),
    ].filter((award): award is NonNullable<typeof award> => award !== null);
  }, [state.matchWinnerId, state.players, state.stats]);
  function visualPosition(playerId: string) {
    if (playerId === youId) return "seat-bottom";
    const index = opponents.findIndex((player) => player.id === playerId);
    return index >= 0 ? seatPosition(index, opponents.length) : "seat-top";
  }
  const lastEvent = useMemo(() => {
    for (let i = state.history.length - 1; i >= 0; i -= 1) {
      const entry = state.history[i];
      if (entry.type === "event") return entry.text;
    }
    return null;
  }, [state.history]);
  useEffect(() => {
    const lastEntry = [...state.history]
      .reverse()
      .find((entry) => entry.type === "card");
    const winnerChanged =
      state.winnerId && state.winnerId !== lastWinnerRef.current;

    if (winnerChanged) {
      pileControls.start("victory");
      lastWinnerRef.current = state.winnerId;
      return;
    }

    if (lastEntry && lastEntry.id !== lastHistoryIdRef.current) {
      if (lastEntry.card.value === "Wild4") {
        pileControls.start("slam");
      } else if (
        lastEntry.card.value === "Draw2" ||
        lastEntry.card.value === "Skip"
      ) {
        pileControls.start("shake");
      }
      lastHistoryIdRef.current = lastEntry.id;
    }
  }, [pileControls, state.history, state.winnerId]);

  useEffect(() => {
    const resultState = state.miniGameResult;
    if (!resultState || resultState.type !== "coin" || resultState.revealUntil === lastCoinEventIdRef.current) return;
    lastCoinEventIdRef.current = resultState.revealUntil;
    const result = resultState.landed;
    if (coinFlipTimer.current !== null) {
      window.clearTimeout(coinFlipTimer.current);
      coinFlipTimer.current = null;
    }
    if (coinFlipClearTimer.current !== null) {
      window.clearTimeout(coinFlipClearTimer.current);
      coinFlipClearTimer.current = null;
    }
    setCoinFlipKey((prev) => prev + 1);
    setCoinFlip({ active: true, result });
    coinFlipTimer.current = window.setTimeout(() => {
      setCoinFlip({ active: false, result });
      setCoinImpactKey((prev) => prev + 1);
      playImpactSound();
      coinFlipTimer.current = null;
      coinFlipClearTimer.current = window.setTimeout(() => {
        setCoinFlip({ active: false, result: null });
        coinFlipClearTimer.current = null;
      }, Math.max(800, resultState.revealUntil - Date.now() - 1100));
    }, 1100);
  }, [state.miniGameResult]);

  useEffect(() => {
    setRpsSelection(null);
    setCoinSelection(null);
    setRpsSubmitted(false);
    setCoinSubmitted(false);
  }, [pendingMiniGame?.type, pendingMiniGame?.throwerId, pendingMiniGame?.targetId]);

  useEffect(() => {
    return () => {
      if (coinFlipTimer.current !== null) {
        window.clearTimeout(coinFlipTimer.current);
      }
      if (coinFlipClearTimer.current !== null) {
        window.clearTimeout(coinFlipClearTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "d") {
        if (
          isYourTurn &&
          !state.winnerId &&
          !pendingWild &&
          !pendingMiniGame &&
          !playerHasPlayable
        ) {
          send({ type: "action", action: { type: "draw" } });
        }
      }
      if (key === "u") {
        if (you?.unoWindow && !you.unoCalled) {
          send({ type: "action", action: { type: "call_uno_self" } });
        }
      }
      if (key === "c") {
        const target = state.players.find(
          (player) =>
            player.id !== youId && player.unoWindow && !player.unoCalled,
        );
        if (target) {
          send({ type: "action", action: { type: "call_uno_on", targetId: target.id } });
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isYourTurn,
    pendingMiniGame,
    pendingWild,
    playerHasPlayable,
    send,
    state.players,
    state.winnerId,
    you?.unoCalled,
    you?.unoWindow,
    youId,
  ]);

  useEffect(() => {
    const container = chatScrollRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
    const lastMessage = state.chat[state.chat.length - 1];
    if (lastMessage && lastMessage.id !== lastChatIdRef.current) {
      lastChatIdRef.current = lastMessage.id;
      if (lastMessage.playerId !== youId) {
        try {
          const AudioCtx =
            window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AudioCtx) return;
          const ctx = new AudioCtx();
          const oscillator = ctx.createOscillator();
          const gain = ctx.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = 740;
          gain.gain.value = 0.02;
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start();
          oscillator.stop(ctx.currentTime + 0.12);
          oscillator.onended = () => {
            ctx.close();
          };
        } catch {
          // ignore audio errors (autoplay restrictions)
        }
      }
    }
  }, [state.chat, youId]);

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 px-4 py-5 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">
            Live table
          </div>
          <div className="display-font text-2xl font-bold">Chillno After Dark</div>
          <div className="text-xs text-slate-500">
            Room ID: {state.roomId}
            {state.isPrivate && state.roomCode ? <button className="ml-2 rounded-full border border-white/10 px-2 py-1 text-[#b8f36b] transition hover:bg-white/10" onClick={async () => { if (!state.roomCode) return; await navigator.clipboard.writeText(state.roomCode); setCodeCopied(true); window.setTimeout(() => setCodeCopied(false), 1800); }}>{codeCopied ? "Copied!" : `Code ${state.roomCode} · Copy`}</button> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Round {state.roundNumber} · {state.players.map((player) => `${player.name} ${state.scores[player.id] ?? 0}`).join(" — ")}</div>
          <div>Turn: {playerLabel(state, state.currentPlayerId)}</div>
          <div>Direction: {state.direction === 1 ? "Clockwise" : "Counter"}</div>
          {state.pendingDraw2 > 0 && (
            <div className="text-amber-300">
              Pending Draw2: {state.pendingDraw2}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="secondary-button px-3 py-2 text-sm" aria-label={muted ? "Turn game sounds on" : "Mute game sounds"} onClick={() => { const next = !muted; setMuted(next); window.localStorage.setItem("chillno-muted", String(next)); }}>{muted ? "Sound off" : "Sound on"}</button>
          <button
            className="rounded-md bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
            onClick={onLeave}
          >
            Leave Room
          </button>
        </div>
      </div>

      <div className="table-felt grid gap-4 rounded-[2rem] border border-white/10 p-4 lg:grid-cols-[1fr_2fr] lg:p-6">
        <div className="lg:col-span-2">
          <motion.div key={state.currentPlayerId} initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} className={`rounded-2xl border px-4 py-3 text-center text-sm font-bold ${isYourTurn ? "border-[#b8f36b]/50 bg-[#b8f36b]/10 text-[#dcffad] turn-glow" : "border-white/10 bg-white/5 text-slate-300"}`}>
            {isYourTurn
              ? "Your Turn — make it count."
              : `${playerLabel(state, state.currentPlayerId)}'s Turn`}
          </motion.div>
        </div>
        {lastEvent && (
          <div className="lg:col-span-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {lastEvent}
          </div>
        )}
        <div className="glass-panel space-y-3 rounded-2xl p-4 text-sm">
          <div className="text-slate-400">Players</div>
          <div className="space-y-3">
            {state.players.map((player) => (
              <div
                key={player.id}
                className={`rounded-lg border px-3 py-2 ${
                  state.currentPlayerId === player.id
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : "border-slate-800 bg-slate-900/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-100">
                    {player.name}
                    {player.id === youId ? " (You)" : ""}
                    {player.disconnected ? (
                      <span className="ml-2 text-amber-300">
                        · reconnecting{player.reconnectDeadline
                          ? ` (${Math.max(0, Math.ceil((player.reconnectDeadline - clock) / 1000))}s)`
                          : ""}
                      </span>
                    ) : ""}
                  </div>
                  <div className="text-xs text-slate-400">
                    Cards: {player.handCount}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <div>
                    UNO: {player.unoWindow ? (player.unoCalled ? "Called" : "Open") : "N/A"}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <details className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <summary className="flex list-none items-center justify-between text-xs uppercase tracking-widest text-slate-500">
              <span>Room Chat</span><span className="rounded-full bg-white/5 px-2 py-1 normal-case tracking-normal">{state.chat.length} messages</span>
            </summary>
            <div
              ref={chatScrollRef}
              className="mt-2 max-h-48 space-y-2 overflow-auto text-xs text-slate-300"
            >
              {state.chat.map((message) => (
                <div
                  key={message.id}
                  className="rounded-md bg-slate-900/60 px-2 py-1"
                >
                  <div className="text-emerald-300">
                    {message.name}
                    {message.playerId === youId ? " (You)" : ""}
                  </div>
                  <div className="text-slate-200">{message.text}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                placeholder="Say something..."
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const text = chatInput.trim();
                    if (!text) return;
                    send({ type: "chat", text });
                    setChatInput("");
                  }
                }}
              />
              <button
                className="rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                onClick={() => {
                  const text = chatInput.trim();
                  if (!text) return;
                  send({ type: "chat", text });
                  setChatInput("");
                }}
              >
                Send
              </button>
            </div>
          </details>
        </div>

        <div className="space-y-4">
          <div className="arena-board relative min-h-[430px] overflow-hidden rounded-[1.75rem] border border-white/10 p-4">
            {state.players.filter((player) => player.id !== youId).map((player, index, opponents) => (
              <PlayerSeat key={player.id} player={player} active={state.currentPlayerId === player.id} position={seatPosition(index, opponents.length)} clock={clock} reaction={latestReaction(player.id)} onCallUno={() => send({ type: "action", action: { type: "call_uno_on", targetId: player.id } })} />
            ))}
            <AnimatePresence>
              {visualEffects.map((effect) => {
                const position = visualPosition(effect.playerId);
                if (effect.type === "play" && effect.card) return <motion.div key={effect.id} className={`flight-card flight-card--in effect-${position}`} initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}><Card color={effect.card.color} value={effect.card.value} compact /></motion.div>;
                if (effect.type === "draw") return <motion.div key={effect.id} className={`flight-card flight-card--out effect-${position}`} initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}><CardBack/><b>+{effect.count}</b></motion.div>;
                if (effect.type === "wild") return <motion.div key={effect.id} className={`wild-wash wild-wash--${effect.card?.color ?? "wild"}`} initial={{ opacity:0 }} animate={{ opacity:[0,.4,.18] }} exit={{ opacity:0 }} />;
                return <motion.div key={effect.id} className={`action-stamp action-stamp--${effect.type}`} initial={{ scale:0, rotate:-12, opacity:0 }} animate={{ scale:[0,1.15,1], rotate:0, opacity:1 }} exit={{ scale:1.4, opacity:0 }}>{effect.type === "skip" ? "SKIPPED" : effect.type === "reverse" ? "REVERSED" : "UNO!"}</motion.div>;
              })}
            </AnimatePresence>
            <div className="absolute left-1/2 top-[58%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-5 sm:gap-8">
              <motion.button className={`pile-slot draw-pile ${canDraw ? "draw-pile--ready" : ""}`} whileHover={canDraw ? { y:-8, rotate:-2 } : {}} whileTap={canDraw ? { scale:.93 } : {}} disabled={!canDraw} onClick={() => send({ type:"action", action:{ type:"draw" } })} title={canDraw ? (state.pendingDraw2 > 0 ? `Take ${state.pendingDraw2} cards` : "Draw a card") : playerHasPlayable ? "You already have a playable card" : "Wait for your turn"}>
                <div className="pointer-events-none scale-90"><CardBack /></div>
                <span>{state.pendingDraw2 > 0 && isYourTurn ? `Take +${state.pendingDraw2}` : "Draw"}</span>
              </motion.button>
              <motion.div className="pile-slot" initial={false} animate={pileControls} variants={{ slam:{ y:[-40,0,8,0],rotate:[-6,0],scale:[1.18,1,.98,1],transition:{duration:.45}}, shake:{x:[0,-5,5,-4,4,0],transition:{duration:.35}}, victory:{scale:[1,1.12,1],transition:{duration:.6}} }}>
                <Card color={topCard.color} value={topCard.value} />
                <span>Discard</span>
              </motion.div>
            </div>
            <motion.div className="direction-orbit" animate={{ rotate: state.direction === 1 ? 360 : -360 }} transition={{ duration: 1.1, type: "spring" }}><span>➜</span></motion.div>
            {state.pendingDraw2 > 0 && <motion.div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-4 py-2 text-sm font-black text-slate-950" initial={{ scale:0 }} animate={{ scale:1 }}>Draw stack +{state.pendingDraw2}</motion.div>}
          </div>

          <div
            className={`relative rounded-2xl border bg-slate-900/60 p-4 ${
              isYourTurn
                ? "border-emerald-400/60 ring-2 ring-emerald-400/40 shadow-lg shadow-emerald-500/10"
                : "border-slate-800"
            }`}
          >
            <AnimatePresence>{yourReaction && <motion.div key={yourReaction.id} className="your-reaction" initial={{ opacity:0, scale:.35, y:15, rotate:10 }} animate={{ opacity:1, scale:[.35,1.18,1], y:0, rotate:0 }} exit={{ opacity:0, scale:.7, y:-20 }}>{yourReaction.emoji}</motion.div>}</AnimatePresence>
            {isYourTurn && <motion.div layoutId="active-seat" className="absolute left-1/2 top-[-.75rem] z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#b8f36b] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#121019]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#121019]"/>Your move</motion.div>}
            {you?.unoWindow && !you.unoCalled && <motion.button className="absolute right-4 top-14 z-20 rounded-full bg-amber-400 px-4 py-2 display-font text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(251,191,36,.38)]" initial={{ scale:0, rotate:-10 }} animate={{ scale:[1,1.08,1], rotate:0 }} transition={{ scale:{repeat:Infinity,duration:1.1} }} onClick={() => send({ type:"action", action:{ type:"call_uno_self" } })}>UNO!</motion.button>}
            {hand.length === 1 && you?.unoCalled && <div className="absolute right-4 top-14 rounded-full border border-[#b8f36b]/30 bg-[#b8f36b]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#b8f36b]">UNO called ✓</div>}
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-rose-400 font-black">{you?.name.slice(0,1).toUpperCase()}</div><div><div className="text-sm font-bold text-slate-100">{you?.name ?? "You"}</div><div className="text-xs text-slate-500">Your hand · {hand.length} cards</div></div></div><div className="text-xs text-slate-500">Bottom seat</div></div>
            <div className="card-hand mt-3">
              {hand.map((card, index) => (
                <button
                  key={`${card.color}-${card.value}-${index}`}
                  onClick={() => {
                    const reason = hand.length === 1 && !you?.unoCalled
                      ? "Call UNO before playing your final card."
                      : !isPlayableForTurn(card, topCard, state.pendingDraw2)
                        ? state.pendingDraw2 > 0 ? "Stack another Draw 2 or take the penalty." : "Match the color or value."
                        : null;
                    if (reason) {
                      setInvalidCard({ index, message: reason });
                      window.setTimeout(() => setInvalidCard(null), 1800);
                      return;
                    }
                    send({ type: "action", action: { type: "play", index } });
                  }}
                  disabled={
                    !isYourTurn ||
                    !!state.winnerId ||
                    pendingWild !== null ||
                    pendingMiniGame !== null ||
                    false
                  }
                  className={`hand-card-button ${isPlayableForTurn(card, topCard, state.pendingDraw2) && !(hand.length === 1 && !you?.unoCalled) ? "hand-card-button--playable" : "hand-card-button--unplayable"} ${invalidCard?.index === index ? "invalid-card" : ""}`}
                >
                  <Card color={card.color} value={card.value} />
                </button>
              ))}
            </div>
            <AnimatePresence>{invalidCard && <motion.div className="mx-auto mt-3 w-fit rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-200" initial={{ opacity:0, y:5 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>{invalidCard.message}</motion.div>}</AnimatePresence>
            <div className="reaction-bar" aria-label="Quick reactions">
              {['😂','😭','😡','👏','🤨'].map((emoji) => <motion.button key={emoji} type="button" whileHover={{ y:-4, scale:1.12 }} whileTap={{ scale:.82 }} onClick={() => send({ type:"reaction", emoji })} aria-label={`React with ${emoji}`}>{emoji}</motion.button>)}
            </div>
          </div>

        </div>
      </div>

      {pendingWild && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-200">
            <div className="text-base font-semibold text-slate-100">
              Choose Wild Color
            </div>
            <div className="mt-2 text-slate-400">
              {pendingWild.playerId === youId
                ? "Select a color to continue."
                : `Waiting for ${playerLabel(state, pendingWild.playerId)}.`}
            </div>
            {pendingWild.playerId === youId && (
              <div className="mt-4 flex gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() =>
                      send({
                        type: "action",
                        action: { type: "choose_wild", color },
                      })
                    }
                    className={`h-10 w-10 rounded-full ring-2 ring-slate-700 ${
                      color === "red"
                        ? "bg-red-500"
                        : color === "yellow"
                          ? "bg-yellow-400"
                          : color === "green"
                            ? "bg-green-500"
                            : "bg-blue-500"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {pendingMiniGame && pendingMiniGame.type === "rps" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-200">
            <div className="text-base font-semibold text-slate-100">
              Rock, Paper, Scissors
            </div>
            <div className="mt-2 text-slate-400">
              Battle: {playerLabel(state, pendingMiniGame.throwerId)} vs{" "}
              {playerLabel(state, pendingMiniGame.targetId)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {pendingMiniGame.throwerId === youId ||
              pendingMiniGame.targetId === youId
                ? rpsSubmitted
                  ? "Locked in. Waiting on the other player."
                  : "Choose your move."
                : "Waiting for players to choose."}
            </div>
            <div className="mt-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">
                Choose color
              </div>
              <div className="mt-2 flex gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() =>
                      send({
                        type: "action",
                        action: { type: "set_mini_color", color },
                      })
                    }
                    disabled={pendingMiniGame.throwerId !== youId}
                    className={`h-9 w-9 rounded-full ring-2 ${
                      pendingMiniGame.chosenColor === color
                        ? "ring-white"
                        : "ring-slate-700"
                    } ${
                      color === "red"
                        ? "bg-red-500"
                        : color === "yellow"
                          ? "bg-yellow-400"
                          : color === "green"
                            ? "bg-green-500"
                            : "bg-blue-500"
                    } ${pendingMiniGame.throwerId !== youId ? "opacity-50" : ""}`}
                  />
                ))}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              {(["rock", "paper", "scissors"] as const).map((choice) => (
                <button
                  key={choice}
                  className={`flex-1 rounded-md px-3 py-2 text-sm capitalize ${
                    rpsSelection === choice
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800 hover:bg-slate-700"
                  } disabled:opacity-50`}
                  onClick={() => setRpsSelection(choice)}
                  disabled={
                    !pendingMiniGame.chosenColor ||
                    pendingMiniGame.throwerId !== youId &&
                    pendingMiniGame.targetId !== youId
                  }
                >
                  {choice}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                onClick={() => {
                  if (rpsSelection) {
                    send({
                      type: "action",
                      action: { type: "rps_choice", choice: rpsSelection },
                    });
                    setRpsSubmitted(true);
                  }
                }}
                disabled={
                  rpsSubmitted ||
                  !pendingMiniGame.chosenColor ||
                  !rpsSelection ||
                  (pendingMiniGame.throwerId !== youId &&
                    pendingMiniGame.targetId !== youId)
                }
              >
                {rpsSubmitted ? "Locked" : "Lock In"}
              </button>
            </div>
          </div>
        </div>
      )}

      {state.miniGameResult?.type === "rps" && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <motion.div className="glass-panel relative w-full max-w-2xl overflow-hidden rounded-3xl p-7 text-center" initial={{ opacity:0, scale:.94 }} animate={{ opacity:1, scale:1 }}>
            <motion.div className="eyebrow" initial={{ opacity:1 }} animate={{ opacity:0 }} transition={{ delay:.75, duration:.2 }}>3 · 2 · 1</motion.div>
            <h2 className="display-font mt-2 text-3xl font-black">SHOW YOUR HAND</h2>
            <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              {[
                { id: state.miniGameResult.throwerId, choice: state.miniGameResult.throwerChoice },
                { id: state.miniGameResult.targetId, choice: state.miniGameResult.targetChoice },
              ].map((entry, index) => (
                <motion.div key={entry.id} className={state.miniGameResult?.winnerId === entry.id ? "rps-choice rps-choice--winner" : "rps-choice"} initial={{ opacity:0, x:index === 0 ? -180 : 180, rotate:index === 0 ? -18 : 18 }} animate={{ opacity:1, x:0, rotate:0 }} transition={{ delay:.8, type:"spring", stiffness:260, damping:18 }}>
                  <div className="rps-choice__sprite">{entry.choice === "rock" ? "✊" : entry.choice === "paper" ? "✋" : "✌️"}</div>
                  <strong>{playerLabel(state, entry.id)}</strong><small>{entry.choice}</small>
                </motion.div>
              )).flatMap((item, index) => index === 0 ? [item, <motion.div key="versus" className="display-font text-xl font-black text-rose-300" initial={{ scale:0 }} animate={{ scale:1 }} transition={{ delay:1.05 }}>VS</motion.div>] : [item])}
            </div>
            <motion.div className="mt-7" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:1.25 }}>
              <div className="display-font text-2xl font-black text-[#b8f36b]">{state.miniGameResult.winnerId ? `${playerLabel(state, state.miniGameResult.winnerId)} wins!` : "It's a tie!"}</div>
              <div className="mt-1 text-sm text-slate-400">{state.miniGameResult.loserId ? `${playerLabel(state, state.miniGameResult.loserId)} draws ${state.miniGameResult.penalty}` : "No penalty this round."}</div>
            </motion.div>
          </motion.div>
        </div>
      )}

      {pendingMiniGame && pendingMiniGame.type === "coin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <motion.div
            key={coinImpactKey}
            className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-200 shadow-2xl"
            animate={
              coinFlip.result && !coinFlip.active
                ? {
                    x: [0, -14, 14, -10, 10, -6, 6, 0],
                    y: [0, 10, 0],
                  }
                : { x: 0, y: 0 }
            }
            transition={{ duration: 0.35, ease: "easeInOut" }}
          >
            <motion.img src="/chill-guy-coin-toss-v2.png" alt="Chill Guy preparing to toss a coin" className="pointer-events-none absolute -bottom-24 -left-10 hidden w-[390px] select-none md:block" initial={{ opacity:0, x:-30 }} animate={{ opacity:.9, x:0, y:[0,-4,0] }} transition={{ opacity:{duration:.35}, x:{duration:.45}, y:{duration:3,repeat:Infinity} }} />
            <div className="relative z-10 md:ml-[48%]">
            <div className="text-base font-semibold text-slate-100">
              Heads or Tails
            </div>
            <div className="mt-2 text-slate-400">
              Battle: {playerLabel(state, pendingMiniGame.throwerId)} vs{" "}
              {playerLabel(state, pendingMiniGame.targetId)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {pendingMiniGame.throwerId === youId
                ? coinSubmitted
                  ? "Locked in. Waiting for the flip."
                  : "Pick heads or tails."
                : "Waiting for the thrower."}
            </div>
            <div className="mt-4 flex items-center justify-center">
              <motion.div
                key={coinImpactKey}
                className="h-24 w-24 [perspective:900px]"
                animate={
                  coinFlip.result && !coinFlip.active
                    ? {
                        y: [0, 18, -6, 8, 0],
                        scale: [1, 0.84, 1.04, 0.98, 1],
                      }
                    : { y: 0, scale: 1 }
                }
                transition={{ duration: 0.45, ease: "easeOut" }}
              >
                <motion.div
                  key={coinFlipKey}
                  className="relative h-full w-full rounded-full [transform-style:preserve-3d]"
                  initial={{ rotateY: 0 }}
                  animate={{
                    rotateY:
                      coinFlip.active
                        ? 360 * 4 + (coinFlip.result === "tails" ? 180 : 0)
                        : coinFlip.result === "tails"
                          ? 180
                          : 0,
                  }}
                  transition={{ duration: 1.1, ease: "easeInOut" }}
                >
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-amber-400 text-lg font-bold text-slate-900 shadow-lg [backface-visibility:hidden]">
                    H
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-amber-200 text-lg font-bold text-slate-900 shadow-lg [transform:rotateY(180deg)] [backface-visibility:hidden]">
                    T
                  </div>
                </motion.div>
              </motion.div>
            </div>
            <div className="mt-2 text-center text-xs text-slate-400">
              {coinFlip.active
                ? "Flipping..."
                : coinFlip.result
                  ? `${coinFlip.result === "heads" ? "Heads" : "Tails"} landed.`
                  : "Ready to flip."}
            </div>
            <div className="mt-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">
                Choose color
              </div>
              <div className="mt-2 flex gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() =>
                      send({
                        type: "action",
                        action: { type: "set_mini_color", color },
                      })
                    }
                    disabled={pendingMiniGame.throwerId !== youId}
                    className={`h-9 w-9 rounded-full ring-2 ${
                      pendingMiniGame.chosenColor === color
                        ? "ring-white"
                        : "ring-slate-700"
                    } ${
                      color === "red"
                        ? "bg-red-500"
                        : color === "yellow"
                          ? "bg-yellow-400"
                          : color === "green"
                            ? "bg-green-500"
                            : "bg-blue-500"
                    } ${pendingMiniGame.throwerId !== youId ? "opacity-50" : ""}`}
                  />
                ))}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              {(["heads", "tails"] as const).map((choice) => (
                <button
                  key={choice}
                  className={`flex-1 rounded-md px-3 py-2 text-sm capitalize ${
                    coinSelection === choice
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800 hover:bg-slate-700"
                  } disabled:opacity-50`}
                  onClick={() => setCoinSelection(choice)}
                  disabled={
                    pendingMiniGame.throwerId !== youId ||
                    !pendingMiniGame.chosenColor ||
                    coinFlip.active
                  }
                >
                  {choice}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                onClick={() => {
                  if (coinSelection) {
                    send({
                      type: "action",
                      action: { type: "coin_choice", choice: coinSelection },
                    });
                    setCoinSubmitted(true);
                  }
                }}
                disabled={
                  coinSubmitted ||
                  !coinSelection ||
                  !pendingMiniGame.chosenColor ||
                  pendingMiniGame.throwerId !== youId ||
                  coinFlip.active
                }
              >
                {coinSubmitted ? "Locked" : coinFlip.active ? "Flipping..." : "Flip"}
              </button>
            </div>
            </div>
          </motion.div>
        </div>
      )}

      {(!pendingMiniGame || pendingMiniGame.type !== "coin") &&
        (coinFlip.active || coinFlip.result) && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
            <motion.div
              key={coinImpactKey}
              className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/95 px-6 py-6 text-center text-sm text-slate-200 shadow-2xl"
              animate={
                coinFlip.result && !coinFlip.active
                  ? {
                      x: [0, -14, 14, -10, 10, -6, 6, 0],
                      y: [0, 10, 0],
                    }
                  : { x: 0, y: 0 }
              }
              transition={{ duration: 0.35, ease: "easeInOut" }}
            >
              <motion.img src="/chill-guy-coin-toss-v2.png" alt="Chill Guy tossing the coin" className="pointer-events-none absolute -bottom-24 -left-12 hidden w-[420px] select-none md:block" initial={{ opacity:0, x:-50, rotate:-3 }} animate={{ opacity:1, x:0, rotate:[-3,1,0], y: coinFlip.active ? [30,-8,0] : 0 }} transition={{ duration:coinFlip.active ? 1.05 : .45, ease:"easeOut" }} />
              <div className="relative z-10 md:ml-[48%]">
              <div className="text-base font-semibold text-slate-100">
                Heads or Tails
              </div>
              <div className="mt-2 flex items-center justify-center">
                <motion.div
                  key={coinImpactKey}
                  className="h-24 w-24 [perspective:900px]"
                animate={
                  coinFlip.result && !coinFlip.active
                    ? {
                        y: [0, 18, -6, 8, 0],
                        scale: [1, 0.84, 1.04, 0.98, 1],
                      }
                    : { y: 0, scale: 1 }
                }
                transition={{ duration: 0.45, ease: "easeOut" }}
              >
                  <motion.div
                    key={coinFlipKey}
                    className="relative h-full w-full rounded-full [transform-style:preserve-3d]"
                    initial={{ rotateY: 0 }}
                    animate={{
                      rotateY:
                        coinFlip.active
                          ? 360 * 4 + (coinFlip.result === "tails" ? 180 : 0)
                          : coinFlip.result === "tails"
                            ? 180
                            : 0,
                    }}
                    transition={{ duration: 1.1, ease: "easeInOut" }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-amber-400 text-lg font-bold text-slate-900 shadow-lg [backface-visibility:hidden]">
                      H
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-amber-200 text-lg font-bold text-slate-900 shadow-lg [transform:rotateY(180deg)] [backface-visibility:hidden]">
                      T
                    </div>
                  </motion.div>
                </motion.div>
              </div>
              <div className="mt-2 text-xs text-slate-400">
                {coinFlip.active
                  ? "Flipping..."
                  : coinFlip.result
                    ? `${coinFlip.result === "heads" ? "Heads" : "Tails"} landed.`
                    : "Ready to flip."}
              </div>
              {coinFlip.result && !coinFlip.active && <motion.div className="mt-3 display-font text-2xl font-black text-amber-300" initial={{ scale:0 }} animate={{ scale:[0,1.2,1] }}>{coinFlip.result === "heads" ? "HEADS!" : "TAILS!"}</motion.div>}
              {state.miniGameResult?.type === "coin" && coinFlip.result && !coinFlip.active && <motion.div className="mt-2" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}><strong className="text-[#b8f36b]">{playerLabel(state, state.miniGameResult.winnerId)} wins</strong><div className="text-xs text-slate-400">{playerLabel(state, state.miniGameResult.loserId)} draws {state.miniGameResult.penalty}</div></motion.div>}
              </div>
            </motion.div>
          </div>
        )}

      <details className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <summary className="cursor-pointer text-sm text-slate-400">
          Discard History
        </summary>
        <div className="mt-3 max-h-48 space-y-2 overflow-auto text-xs text-slate-300">
          {[...state.history]
            .reverse()
            .map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-md bg-slate-900/80 px-3 py-2"
              >
                {entry.type === "card" ? (
                  <>
                    <div>
                      {entry.card.color}, {entry.card.value}
                    </div>
                    <div className="text-slate-500">
                      {playerLabel(state, entry.playerId)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-slate-200">{entry.text}</div>
                    <div className="text-slate-500">Event</div>
                  </>
                )}
              </div>
            ))}
        </div>
      </details>

      {showRules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-emerald-400/40 bg-slate-950 p-6 text-sm text-slate-200 shadow-2xl shadow-emerald-500/10">
            <div className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">
              Chillno Rules
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-100">
              Quick Play Guide
            </div>
            <div className="mt-3 space-y-2 text-slate-300">
              <div>- Match by color or value.</div>
              <div>- Wild / Wild4 can be played anytime and set a color.</div>
              <div>- Draw2 stacks; if it ends, next player draws the total.</div>
              <div>- Skip skips the next player. Reverse flips direction.</div>
              <div>- RPS: thrower and target choose. Loser draws 4.</div>
              <div>- HT: thrower picks heads/tails. Loser draws 3.</div>
              <div>- Call UNO when you hit 1 card, or draw 2.</div>
            </div>
            <button
              className="mt-5 w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              onClick={() => setShowRules(false)}
            >
              Got It — Let’s Play
            </button>
          </div>
        </div>
      )}

      {state.winnerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-400/40 bg-slate-950 p-6 text-center text-sm text-slate-200 shadow-2xl shadow-amber-500/20">
            {state.matchWinnerId ? (
              <>
                <motion.div className="text-5xl" initial={{ scale:0, rotate:-15 }} animate={{ scale:[0,1.25,1], rotate:0 }}>🏆</motion.div>
                <div className="mt-3 text-xs uppercase tracking-[0.3em] text-amber-300">Match complete</div>
                <div className="display-font mt-2 text-3xl font-black text-amber-200">{state.matchWinnerId === youId ? "You own the table!" : `${playerLabel(state, state.matchWinnerId)} wins the match!`}</div>
                <div className="mt-2 text-slate-300">First to two. No excuses left.</div>
              </>
            ) : state.winnerId === youId ? (
              <>
                <div className="text-xs uppercase tracking-[0.3em] text-amber-300">
                  Champion
                </div>
                <div className="mt-3 text-3xl font-black text-amber-200">
                  You Win!
                </div>
                <div className="mt-2 text-slate-300">
                  That was clean. Run it back?
                </div>
              </>
            ) : (
              <>
                <div className="text-xs uppercase tracking-[0.3em] text-rose-300">
                  Defeat
                </div>
                <div className="mt-3 text-2xl font-bold text-rose-200">
                  {insult}
                </div>
                <div className="mt-2 text-slate-300">
                  {playerLabel(state, state.winnerId)} took the crown.
                </div>
              </>
            )}
            <div className="mt-5 grid gap-2">
              {state.players.slice().sort((a,b) => (state.scores[b.id] ?? 0) - (state.scores[a.id] ?? 0)).map((player) => <div key={player.id} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${player.id === state.winnerId ? "border-amber-400/30 bg-amber-400/10" : "border-white/10 bg-white/5"}`}><span className="font-semibold">{player.name}{player.id === youId ? " (You)" : ""}</span><span className="display-font text-xl font-black">{state.scores[player.id] ?? 0}<small className="ml-1 text-[10px] font-normal text-slate-500">/ 2</small></span></div>)}
            </div>
            {state.matchWinnerId && matchAwards.length > 0 && <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">{matchAwards.map((award) => <div className="match-award" key={award.title}><span>{award.emoji}</span><strong>{award.title}</strong><small>{award.player.name} · {award.value}</small></div>)}</div>}
            <div className="mt-5 flex flex-col items-center gap-2">
              <button
                className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                onClick={() => send({ type: "play_again" })}
                disabled={state.rematchVotes.includes(youId)}
              >
                {state.rematchVotes.includes(youId) ? "Waiting for others..." : state.matchWinnerId ? "New Match" : `Ready for Round ${state.roundNumber + 1}`}
              </button>
              <div className="text-xs text-slate-500">
                Rematch votes: {state.rematchVotes.length}/{state.players.length}
              </div>
              <button
                className="text-xs text-slate-400 hover:text-slate-200"
                onClick={onLeave}
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
