import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import Card from "../components/Card";
import CardBack from "../components/CardBack";
import type { deckOutline } from "../types/cards";
import type { ActivePublicState, ClientMessage } from "../types/online";

const COLORS = ["red", "yellow", "green", "blue"] as const;

function isPlayable(card: deckOutline, top: deckOutline): boolean {
  if (card.color === "wild" || card.value === "Wild" || card.value === "Wild4") {
    return true;
  }
  if (card.value === "RPS" || card.value === "HT") {
    return true;
  }
  return card.color === top.color || card.value === top.value;
}

function isPlayableForTurn(
  card: deckOutline,
  top: deckOutline,
  pendingDraw2: number,
): boolean {
  if (pendingDraw2 > 0) {
    return card.value === "Draw2";
  }
  return isPlayable(card, top);
}

function playerLabel(state: ActivePublicState, id: string) {
  return state.players.find((player) => player.id === id)?.name ?? "Player";
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
  const [rpsSelection, setRpsSelection] = useState<"rock" | "paper" | "scissors" | null>(null);
  const [coinSelection, setCoinSelection] = useState<"heads" | "tails" | null>(null);
  const [rpsSubmitted, setRpsSubmitted] = useState(false);
  const [coinSubmitted, setCoinSubmitted] = useState(false);
  const [showRules, setShowRules] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const lastChatIdRef = useRef<number | null>(null);
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
    return pool[Math.floor(Math.random() * pool.length)];
  }, [state.winnerId]);
  const pileControls = useAnimation();
  const lastHistoryIdRef = useRef<number | null>(null);
  const lastWinnerRef = useRef<string | null>(null);

  const topCard = useMemo(() => state.discardTop, [state.discardTop]);
  const you = state.players.find((player) => player.id === youId);
  const isYourTurn = state.currentPlayerId === youId;
  const pendingWild = state.pendingWild;
  const pendingMiniGame = state.pendingMiniGame;
  const playerHasPlayable = hand.some((card) =>
    isPlayableForTurn(card, topCard, state.pendingDraw2),
  );
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
    setRpsSelection(null);
    setCoinSelection(null);
    setRpsSubmitted(false);
    setCoinSubmitted(false);
  }, [pendingMiniGame?.type, pendingMiniGame?.throwerId, pendingMiniGame?.targetId]);

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
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">
            Chill Coding Lounge
          </div>
          <div className="text-2xl font-semibold">Chillno Arena</div>
          <div className="text-xs text-slate-500">
            Room ID: {state.roomId}
            {state.isPrivate && state.roomCode
              ? ` · Code: ${state.roomCode}`
              : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <div>Turn: {playerLabel(state, state.currentPlayerId)}</div>
          <div>Direction: {state.direction === 1 ? "Clockwise" : "Counter"}</div>
          {state.pendingDraw2 > 0 && (
            <div className="text-amber-300">
              Pending Draw2: {state.pendingDraw2}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-md bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
            onClick={onLeave}
          >
            Leave Room
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 shadow-lg shadow-emerald-500/10 animate-pulse">
            {isYourTurn
              ? "Your Turn — make it count."
              : `${playerLabel(state, state.currentPlayerId)}'s Turn`}
          </div>
        </div>
        {lastEvent && (
          <div className="lg:col-span-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {lastEvent}
          </div>
        )}
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm">
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
                    {player.disconnected ? " - Disconnected" : ""}
                  </div>
                  <div className="text-xs text-slate-400">
                    Cards: {player.handCount}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <div>
                    UNO: {player.unoWindow ? (player.unoCalled ? "Called" : "Open") : "N/A"}
                  </div>
                  {player.id !== youId &&
                    player.unoWindow &&
                    !player.unoCalled && (
                      <button
                        className="rounded-md bg-amber-500/20 px-2 py-1 text-amber-200 hover:bg-amber-500/30"
                        onClick={() =>
                          send({
                            type: "action",
                            action: { type: "call_uno_on", targetId: player.id },
                          })
                        }
                      >
                        Call UNO
                      </button>
                    )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="text-xs uppercase tracking-widest text-slate-500">
              Room Chat
            </div>
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
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-sm text-slate-400">Top of Discard</div>
            <div className="mt-3">
              <motion.div
                initial={false}
                animate={pileControls}
                variants={{
                  slam: {
                    y: [-40, 0, 8, 0],
                    rotate: [-6, 0],
                    scale: [1.18, 1, 0.98, 1],
                    boxShadow: [
                      "0 0 0 rgba(0,0,0,0)",
                      "0 0 26px rgba(245,158,11,0.65)",
                    ],
                    transition: { duration: 0.45 },
                  },
                  shake: {
                    x: [0, -4, 4, -3, 3, 0],
                    boxShadow: [
                      "0 0 0 rgba(0,0,0,0)",
                      "0 0 22px rgba(16,185,129,0.55)",
                      "0 0 0 rgba(0,0,0,0)",
                    ],
                    transition: { duration: 0.35 },
                  },
                  victory: {
                    scale: [1, 1.08, 1],
                    boxShadow: [
                      "0 0 0 rgba(0,0,0,0)",
                      "0 0 30px rgba(59,130,246,0.65)",
                      "0 0 0 rgba(0,0,0,0)",
                    ],
                    transition: { duration: 0.6 },
                  },
                }}
              >
                <Card color={topCard.color} value={topCard.value} />
              </motion.div>
            </div>
          </div>

          <div
            className={`rounded-xl border bg-slate-900/60 p-4 ${
              isYourTurn
                ? "border-emerald-400/60 ring-2 ring-emerald-400/40 shadow-lg shadow-emerald-500/10"
                : "border-slate-800"
            }`}
          >
            <div className="text-sm text-slate-400">Your Hand</div>
            <div className="text-xs text-slate-500">Cards: {hand.length}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {hand.map((card, index) => (
                <button
                  key={`${card.color}-${card.value}-${index}`}
                  onClick={() =>
                    send({ type: "action", action: { type: "play", index } })
                  }
                  disabled={
                    !isYourTurn ||
                    !!state.winnerId ||
                    pendingWild !== null ||
                    pendingMiniGame !== null ||
                    !isPlayableForTurn(card, topCard, state.pendingDraw2)
                  }
                  className="rounded-lg transition hover:-translate-y-1 disabled:opacity-50"
                >
                  <Card color={card.color} value={card.value} />
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                onClick={() => send({ type: "action", action: { type: "draw" } })}
                disabled={
                  !isYourTurn ||
                  !!state.winnerId ||
                  pendingWild !== null ||
                  pendingMiniGame !== null ||
                  playerHasPlayable
                }
              >
                Draw
              </button>
              <button
                className="rounded-md bg-amber-500 px-3 py-2 text-sm text-black hover:bg-amber-400 disabled:opacity-50"
                onClick={() =>
                  send({ type: "action", action: { type: "call_uno_self" } })
                }
                disabled={!you?.unoWindow || you.unoCalled}
              >
                UNO
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-sm text-slate-400">Other Players</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {state.players
                .filter((player) => player.id !== youId)
                .map((player) => (
                  <div key={player.id} className="flex flex-col items-center gap-2">
                    <CardBack label={player.name} />
                    <div className="text-xs text-slate-400">
                      {player.handCount} cards
                    </div>
                  </div>
                ))}
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

      {pendingMiniGame && pendingMiniGame.type === "coin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-200">
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
                    !pendingMiniGame.chosenColor
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
                  pendingMiniGame.throwerId !== youId
                }
              >
                {coinSubmitted ? "Locked" : "Flip"}
              </button>
            </div>
          </div>
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
            {state.winnerId === youId ? (
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
            <div className="mt-5 flex flex-col items-center gap-2">
              <button
                className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                onClick={() => send({ type: "play_again" })}
                disabled={state.rematchVotes.includes(youId)}
              >
                {state.rematchVotes.includes(youId)
                  ? "Waiting for others..."
                  : "Play Again"}
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











