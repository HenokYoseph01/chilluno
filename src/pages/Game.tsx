import { useEffect, useMemo, useRef, useState } from "react";
import Card from "../components/Card";
import { generateDeck, shuffleArray } from "../game/deckEngine";
import type { Color, deckOutline } from "../types/cards";

type Player = "player" | "ai";
type WildValue = "Wild" | "Wild4";

const COLORS: Color[] = ["red", "yellow", "green", "blue"];

interface DiscardEntry {
  card: deckOutline;
  player: Player;
}

interface GameState {
  deck: deckOutline[];
  playerHand: deckOutline[];
  aiHand: deckOutline[];
  discardPile: DiscardEntry[];
  currentPlayer: Player;
  winner: Player | null;
  direction: 1 | -1;
  pendingWild: { player: Player; value: WildValue } | null;
  unoCalled: { player: boolean; ai: boolean };
  actionNonce: number;
  unoWindow: {
    player: boolean;
    ai: boolean;
    playerToken: number;
    aiToken: number;
  };
}

function pickRandomColor(): Color {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function initGame(): GameState {
  const deck = generateDeck();
  const playerHand = deck.slice(0, 7);
  const aiHand = deck.slice(7, 14);
  let discard = deck[14];
  if (discard.color === "wild") {
    discard = { ...discard, color: pickRandomColor() };
  }
  const remainingDeck = deck.slice(15);

  return {
    deck: remainingDeck,
    playerHand,
    aiHand,
    discardPile: [{ card: discard, player: "player" }],
    currentPlayer: "player",
    winner: null,
    direction: 1,
    pendingWild: null,
    unoCalled: { player: true, ai: true },
    actionNonce: 0,
    unoWindow: {
      player: false,
      ai: false,
      playerToken: 0,
      aiToken: 0,
    },
  };
}

function isPlayable(card: deckOutline, top: deckOutline): boolean {
  if (card.color === "wild" || card.value === "Wild" || card.value === "Wild4") {
    return true;
  }
  return card.color === top.color || card.value === top.value;
}

function pickBestColor(hand: deckOutline[]): Color {
  const counts = new Map<Color, number>([
    ["red", 0],
    ["yellow", 0],
    ["green", 0],
    ["blue", 0],
  ]);

  for (const card of hand) {
    if (card.color !== "wild") {
      counts.set(card.color, (counts.get(card.color) ?? 0) + 1);
    }
  }

  let best: Color = pickRandomColor();
  let bestCount = -1;
  for (const color of COLORS) {
    const count = counts.get(color) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      best = color;
    }
  }

  return best;
}

function refillDeckIfNeeded(
  deck: deckOutline[],
  discardPile: DiscardEntry[],
): { deck: deckOutline[]; discardPile: DiscardEntry[] } {
  if (deck.length > 0 || discardPile.length <= 1) {
    return { deck, discardPile };
  }

  const top = discardPile[discardPile.length - 1];
  const newDeck = shuffleArray(
    discardPile.slice(0, -1).map((entry) => entry.card),
  );
  return { deck: newDeck, discardPile: [top] };
}

function drawCards(
  state: GameState,
  player: Player,
  count: number,
): GameState {
  let deck = [...state.deck];
  let discardPile = [...state.discardPile];
  let playerHand = [...state.playerHand];
  let aiHand = [...state.aiHand];

  for (let i = 0; i < count; i += 1) {
    ({ deck, discardPile } = refillDeckIfNeeded(deck, discardPile));
    if (deck.length === 0) break;
    const [drawn, ...rest] = deck;
    deck = rest;
    if (player === "player") {
      playerHand.push(drawn);
    } else {
      aiHand.push(drawn);
    }
  }

  return { ...state, deck, discardPile, playerHand, aiHand };
}

function finishPlay(
  state: GameState,
  player: Player,
  card: deckOutline,
  chosenColor?: Color,
): GameState {
  const isTwoPlayers = true;
  const cardToDiscard =
    card.color === "wild"
      ? { ...card, color: chosenColor ?? pickRandomColor() }
      : card;
  let nextState: GameState = {
    ...state,
    discardPile: [...state.discardPile, { card: cardToDiscard, player }],
  };

  let drawCount = 0;
  let skip = false;
  let direction = state.direction;

  if (card.value === "Reverse") {
    direction = direction === 1 ? -1 : 1;
    if (isTwoPlayers) {
      skip = true;
    }
  }

  if (card.value === "Skip") {
    skip = true;
  }

  if (card.value === "Draw2") {
    drawCount = 2;
    skip = true;
  }

  if (card.value === "Wild4") {
    drawCount = 4;
    skip = true;
  }

  nextState = { ...nextState, direction };

  const nextPlayer: Player = player === "player" ? "ai" : "player";
  if (drawCount > 0) {
    nextState = drawCards(nextState, nextPlayer, drawCount);
  }

  nextState.currentPlayer = skip ? player : nextPlayer;
  nextState.actionNonce += 1;
  return nextState;
}

export default function Game({ onBack }: { onBack: () => void }) {
  const [game, setGame] = useState<GameState>(() => initGame());
  const [unoBanner, setUnoBanner] = useState<string | null>(null);
  const unoBannerTimer = useRef<number | null>(null);
  const aiAutoUnoTimer = useRef<number | null>(null);
  const aiCallPlayerTimer = useRef<number | null>(null);

  const topCard = useMemo(
    () => game.discardPile[game.discardPile.length - 1].card,
    [game.discardPile],
  );

  const {
    deck,
    playerHand,
    aiHand,
    currentPlayer,
    winner,
    pendingWild,
    unoCalled,
    unoWindow,
    actionNonce,
  } = game;

  const playerHasPlayable = playerHand.some((card) =>
    isPlayable(card, topCard),
  );

  function resetGame() {
    setGame(initGame());
    setUnoBanner(null);
    if (unoBannerTimer.current !== null) {
      window.clearTimeout(unoBannerTimer.current);
      unoBannerTimer.current = null;
    }
    if (aiAutoUnoTimer.current !== null) {
      window.clearTimeout(aiAutoUnoTimer.current);
      aiAutoUnoTimer.current = null;
    }
    if (aiCallPlayerTimer.current !== null) {
      window.clearTimeout(aiCallPlayerTimer.current);
      aiCallPlayerTimer.current = null;
    }
  }

  function drawCard(player: Player) {
    setGame((prev) => {
      if (prev.winner || prev.pendingWild) return prev;
      return drawCards(prev, player, 1);
    });
  }

  function playCard(player: Player, index: number) {
    setGame((prev) => {
      if (prev.winner || prev.currentPlayer !== player || prev.pendingWild) {
        return prev;
      }
      const top = prev.discardPile[prev.discardPile.length - 1].card;
      const hand = player === "player" ? prev.playerHand : prev.aiHand;
      const card = hand[index];
      if (!card || !isPlayable(card, top)) {
        return prev;
      }

      const nextHand = hand.filter((_, i) => i !== index);
      let nextState: GameState = {
        ...prev,
        playerHand: player === "player" ? nextHand : prev.playerHand,
        aiHand: player === "ai" ? nextHand : prev.aiHand,
      };

      if (card.value === "Wild" || card.value === "Wild4") {
        if (nextHand.length === 0) {
          nextState = finishPlay(nextState, player, card, pickRandomColor());
          nextState.winner = player;
          return nextState;
        }
        return {
          ...nextState,
          discardPile: [...prev.discardPile, { card, player }],
          pendingWild: { player, value: card.value },
        };
      }

      nextState = finishPlay(nextState, player, card);
      if (nextHand.length === 0) {
        nextState.winner = player;
      }
      return nextState;
    });
  }

  function callUnoSelf(player: Player) {
    setGame((prev) => {
      if (prev.winner || prev.pendingWild) return prev;
      const hand = player === "player" ? prev.playerHand : prev.aiHand;
      if (hand.length !== 1) return prev;
      if (prev.unoCalled[player]) return prev;
      return {
        ...prev,
        unoCalled: { ...prev.unoCalled, [player]: true },
      };
    });
  }

  function callUnoOn(target: Player) {
    setGame((prev) => {
      if (prev.winner || prev.pendingWild) return prev;
      const hand = target === "player" ? prev.playerHand : prev.aiHand;
      if (hand.length !== 1) return prev;
      if (prev.unoCalled[target]) return prev;
      let nextState = drawCards(prev, target, 2);
      nextState = {
        ...nextState,
        unoCalled: { ...nextState.unoCalled, [target]: true },
        unoWindow: { ...nextState.unoWindow, [target]: false },
        currentPlayer: "player",
        actionNonce: nextState.actionNonce + 1,
      };
      return nextState;
    });
  }

  function showUnoBanner(message: string) {
    setUnoBanner(message);
    if (unoBannerTimer.current !== null) {
      window.clearTimeout(unoBannerTimer.current);
    }
    unoBannerTimer.current = window.setTimeout(() => {
      setUnoBanner(null);
      unoBannerTimer.current = null;
    }, 1600);
  }

  function chooseWildColor(color: Color) {
    setGame((prev) => {
      if (!prev.pendingWild || prev.pendingWild.player !== "player") {
        return prev;
      }
      const last = prev.discardPile[prev.discardPile.length - 1];
      const updatedDiscard = { ...last.card, color };
      let nextState: GameState = {
        ...prev,
        discardPile: prev.discardPile.slice(0, -1),
        pendingWild: null,
      };
      nextState = finishPlay(nextState, "player", updatedDiscard, color);
      if (nextState.playerHand.length === 0) {
        nextState.winner = "player";
      }
      return nextState;
    });
  }

  useEffect(() => {
    if (winner || currentPlayer !== "ai" || pendingWild) return;
    const timer = setTimeout(() => {
      setGame((prev) => {
        if (prev.winner || prev.currentPlayer !== "ai" || prev.pendingWild) {
          return prev;
        }
        const top = prev.discardPile[prev.discardPile.length - 1].card;
        const playableIndex = prev.aiHand.findIndex((card) =>
          isPlayable(card, top),
        );

        if (playableIndex === -1) {
          let nextState = drawCards(prev, "ai", 1);
          const drawn = nextState.aiHand[nextState.aiHand.length - 1];
          if (drawn && isPlayable(drawn, top)) {
            const chosenColor =
              drawn.value === "Wild" || drawn.value === "Wild4"
                ? pickBestColor(
                    nextState.aiHand.filter(
                      (_, i) => i !== nextState.aiHand.length - 1,
                    ),
                  )
                : undefined;
            const updatedHand = nextState.aiHand.slice(0, -1);
            nextState = {
              ...nextState,
              aiHand: updatedHand,
            };
            nextState = finishPlay(nextState, "ai", drawn, chosenColor);
            if (updatedHand.length === 0) {
              nextState.winner = "ai";
            }
            return nextState;
          }
          return { ...nextState, currentPlayer: "player" };
        }

        const card = prev.aiHand[playableIndex];
        const nextHand = prev.aiHand.filter((_, i) => i !== playableIndex);
        let nextState: GameState = {
          ...prev,
          aiHand: nextHand,
        };
        if (card.value === "Wild" || card.value === "Wild4") {
          const chosenColor = pickBestColor(nextHand);
          nextState = finishPlay(nextState, "ai", card, chosenColor);
        } else {
          nextState = finishPlay(nextState, "ai", card);
        }
        if (nextHand.length === 0) {
          nextState.winner = "ai";
        }
        return nextState;
      });
    }, 600);

    return () => clearTimeout(timer);
  }, [actionNonce, currentPlayer, pendingWild, winner]);

  useEffect(() => {
    setGame((prev) => {
      if (prev.winner) return prev;
      let changed = false;
      let nextState = prev;

      if (prev.playerHand.length === 1 && !prev.unoWindow.player) {
        nextState = {
          ...nextState,
          unoWindow: {
            ...nextState.unoWindow,
            player: true,
            playerToken: nextState.unoWindow.playerToken + 1,
          },
          unoCalled: { ...nextState.unoCalled, player: false },
        };
        changed = true;
      }

      if (prev.playerHand.length !== 1 && prev.unoWindow.player) {
        nextState = {
          ...nextState,
          unoWindow: { ...nextState.unoWindow, player: false },
          unoCalled: { ...nextState.unoCalled, player: true },
        };
        changed = true;
      }

      if (prev.aiHand.length === 1 && !prev.unoWindow.ai) {
        nextState = {
          ...nextState,
          unoWindow: {
            ...nextState.unoWindow,
            ai: true,
            aiToken: nextState.unoWindow.aiToken + 1,
          },
          unoCalled: { ...nextState.unoCalled, ai: false },
        };
        changed = true;
      }

      if (prev.aiHand.length !== 1 && prev.unoWindow.ai) {
        nextState = {
          ...nextState,
          unoWindow: { ...nextState.unoWindow, ai: false },
          unoCalled: { ...nextState.unoCalled, ai: true },
        };
        changed = true;
      }

      return changed ? nextState : prev;
    });
  }, [aiHand.length, playerHand.length, winner]);

  useEffect(() => {
    if (winner || pendingWild) return;
    if (aiAutoUnoTimer.current !== null) {
      window.clearTimeout(aiAutoUnoTimer.current);
      aiAutoUnoTimer.current = null;
    }
    if (unoWindow.ai && !unoCalled.ai) {
      const token = unoWindow.aiToken;
      aiAutoUnoTimer.current = window.setTimeout(() => {
        setGame((prev) => {
          if (!prev.unoWindow.ai || prev.unoWindow.aiToken !== token) {
            return prev;
          }
          if (prev.unoCalled.ai || prev.aiHand.length !== 1) {
            return prev;
          }
          showUnoBanner("AI called UNO!");
          return {
            ...prev,
            unoCalled: { ...prev.unoCalled, ai: true },
          };
        });
      }, 1000);
    }
    return () => {
      if (aiAutoUnoTimer.current !== null) {
        window.clearTimeout(aiAutoUnoTimer.current);
        aiAutoUnoTimer.current = null;
      }
    };
  }, [pendingWild, unoCalled.ai, unoWindow.ai, unoWindow.aiToken, winner]);

  useEffect(() => {
    if (winner || pendingWild) return;
    if (aiCallPlayerTimer.current !== null) {
      window.clearTimeout(aiCallPlayerTimer.current);
      aiCallPlayerTimer.current = null;
    }
    if (unoWindow.player && !unoCalled.player) {
      const token = unoWindow.playerToken;
      aiCallPlayerTimer.current = window.setTimeout(() => {
        setGame((prev) => {
          if (!prev.unoWindow.player || prev.unoWindow.playerToken !== token) {
            return prev;
          }
          if (prev.unoCalled.player || prev.playerHand.length !== 1) {
            return prev;
          }
          let nextState = drawCards(prev, "player", 2);
          nextState = {
            ...nextState,
            unoCalled: { ...nextState.unoCalled, player: true },
            unoWindow: { ...nextState.unoWindow, player: false },
          };
          showUnoBanner("AI called UNO on you. Draw 2.");
          return nextState;
        });
      }, 1000);
    }
    return () => {
      if (aiCallPlayerTimer.current !== null) {
        window.clearTimeout(aiCallPlayerTimer.current);
        aiCallPlayerTimer.current = null;
      }
    };
  }, [pendingWild, unoCalled.player, unoWindow.player, unoWindow.playerToken, winner]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-400">
            UNO Clone
          </div>
          <div className="text-2xl font-semibold">Table</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-md bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
            onClick={resetGame}
          >
            Restart
          </button>
          <button
            className="rounded-md bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
            onClick={onBack}
          >
            Back
          </button>
          <button
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
            onClick={() => drawCard("player")}
            disabled={
              currentPlayer !== "player" ||
              !!winner ||
              pendingWild ||
              playerHasPlayable
            }
          >
            Draw
          </button>
          <button
            className="rounded-md bg-amber-500 px-3 py-2 text-sm text-black hover:bg-amber-400 disabled:opacity-50"
            onClick={() => {
              if (unoWindow.player && !unoCalled.player) {
                callUnoSelf("player");
                showUnoBanner("You called UNO!");
              }
            }}
            disabled={!unoWindow.player || unoCalled.player}
          >
            UNO
          </button>
          <button
            className="rounded-md bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600 disabled:opacity-50"
            onClick={() => {
              if (unoWindow.ai && !unoCalled.ai) {
                callUnoOn("ai");
                showUnoBanner("UNO called on AI. It draws 2.");
              }
            }}
            disabled={!unoWindow.ai || unoCalled.ai}
          >
            Call UNO (AI)
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-sm text-slate-400">AI</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {aiHand.map((_, index) => (
              <div
                key={`ai-${index}`}
                className="h-24 w-16 rounded-lg bg-slate-800/80 ring-1 ring-slate-700"
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="text-sm text-slate-400">Discard</div>
          <Card color={topCard.color} value={topCard.value} />
          <div className="text-xs text-slate-400">Deck: {deck.length} cards</div>
          <div className="text-xs text-slate-400">Turn: {currentPlayer}</div>
          {winner && (
            <div className="rounded-full bg-amber-500/20 px-4 py-2 text-sm text-amber-300">
              Winner: {winner}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-sm text-slate-400">You</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {playerHand.map((val, index) => (
              <button
                key={`${val.color}-${val.value}-${index}`}
                onClick={() => playCard("player", index)}
                disabled={
                  currentPlayer !== "player" ||
                  !!winner ||
                  pendingWild !== null ||
                  !isPlayable(val, topCard)
                }
                className="rounded-lg transition hover:-translate-y-1 disabled:opacity-50"
              >
                <Card color={val.color} value={val.value} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {pendingWild && pendingWild.player === "player" && (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-sm text-slate-400">Choose a color</div>
          <div className="mt-3 flex gap-2">
            {COLORS.map((color) => (
              <button
                key={color}
                onClick={() => chooseWildColor(color)}
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
        </div>
      )}

      {unoBanner && (
        <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {unoBanner}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="text-sm text-slate-400">Discard History</div>
        <div className="mt-3 max-h-48 space-y-2 overflow-auto text-xs text-slate-300">
          {[...game.discardPile]
            .reverse()
            .map((entry, index) => (
              <div
                key={`${entry.card.color}-${entry.card.value}-${index}`}
                className="flex items-center justify-between rounded-md bg-slate-900/80 px-3 py-2"
              >
                <div>
                  {entry.card.color}, {entry.card.value}
                </div>
                <div className="text-slate-500">
                  {entry.player === "player" ? "You" : "AI"}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
