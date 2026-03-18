import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import Card from "../components/Card";
import { generateDeck, shuffleArray } from "../game/deckEngine";
import type { Color, deckOutline } from "../types/cards";

type Player = "player" | "ai";
type WildValue = "Wild" | "Wild4";
type RpsChoice = "rock" | "paper" | "scissors";
type CoinChoice = "heads" | "tails";

const COLORS: Color[] = ["red", "yellow", "green", "blue"];

interface DiscardEntry {
  card: deckOutline;
  player: Player;
}

type HistoryEntry =
  | { id: number; type: "card"; card: deckOutline; player: Player }
  | { id: number; type: "event"; text: string };

interface GameState {
  deck: deckOutline[];
  playerHand: deckOutline[];
  aiHand: deckOutline[];
  discardPile: DiscardEntry[];
  history: HistoryEntry[];
  historyCounter: number;
  currentPlayer: Player;
  winner: Player | null;
  direction: 1 | -1;
  pendingWild: { player: Player; value: WildValue } | null;
  pendingDraw2: number;
  pendingMiniGame:
    | { type: "rps"; player: Player; chosenColor: Color | null }
    | { type: "coin"; player: Player; chosenColor: Color | null }
    | null;
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
    history: [{ id: 0, type: "card", card: discard, player: "player" }],
    historyCounter: 1,
    currentPlayer: "player",
    winner: null,
    direction: 1,
    pendingWild: null,
    pendingDraw2: 0,
    pendingMiniGame: null,
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

function resolveRpsWinner(
  playerChoice: RpsChoice,
  aiChoice: RpsChoice,
): Player | "tie" {
  if (playerChoice === aiChoice) return "tie";
  if (
    (playerChoice === "rock" && aiChoice === "scissors") ||
    (playerChoice === "paper" && aiChoice === "rock") ||
    (playerChoice === "scissors" && aiChoice === "paper")
  ) {
    return "player";
  }
  return "ai";
}

function addHistoryCard(
  state: GameState,
  card: deckOutline,
  player: Player,
): GameState {
  return {
    ...state,
    history: [
      ...state.history,
      { id: state.historyCounter, type: "card", card, player },
    ],
    historyCounter: state.historyCounter + 1,
  };
}

function addHistoryEvent(state: GameState, text: string): GameState {
  return {
    ...state,
    history: [
      ...state.history,
      { id: state.historyCounter, type: "event", text },
    ],
    historyCounter: state.historyCounter + 1,
  };
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
  nextState = addHistoryCard(nextState, cardToDiscard, player);

  let drawCount = 0;
  let skip = false;
  let direction = state.direction;
  let pendingDraw2 = state.pendingDraw2;

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
    pendingDraw2 += 2;
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

  nextState.currentPlayer =
    card.value === "Draw2" ? nextPlayer : skip ? player : nextPlayer;
  nextState.pendingDraw2 = pendingDraw2;
  nextState.actionNonce += 1;
  return nextState;
}

export default function Game({ onBack }: { onBack: () => void }) {
  const [game, setGame] = useState<GameState>(() => initGame());
  const [unoBanner, setUnoBanner] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [rpsSelection, setRpsSelection] = useState<RpsChoice | null>(null);
  const [coinSelection, setCoinSelection] = useState<CoinChoice | null>(null);
  const pileControls = useAnimation();
  const lastHistoryIdRef = useRef<number | null>(null);
  const lastWinnerRef = useRef<Player | null>(null);
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
    pendingDraw2,
    pendingMiniGame,
    unoCalled,
    unoWindow,
    actionNonce,
  } = game;

  const playerHasPlayable = playerHand.some((card) =>
    isPlayableForTurn(card, topCard, pendingDraw2),
  );

  useEffect(() => {
    const lastEntry = [...game.history]
      .reverse()
      .find((entry) => entry.type === "card");
    const winnerChanged = winner && winner !== lastWinnerRef.current;

    if (winnerChanged) {
      pileControls.start("victory");
      lastWinnerRef.current = winner;
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
  }, [game.history, pileControls, winner]);

  function resetGame() {
    setGame(initGame());
    setUnoBanner(null);
    setRpsSelection(null);
    setCoinSelection(null);
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
      if (prev.winner || prev.pendingWild || prev.pendingMiniGame) return prev;
      if (prev.pendingDraw2 > 0 && prev.currentPlayer === player) {
        let nextState = drawCards(prev, player, prev.pendingDraw2);
        nextState = {
          ...nextState,
          pendingDraw2: 0,
          currentPlayer: player === "player" ? "ai" : "player",
          actionNonce: nextState.actionNonce + 1,
        };
        return nextState;
      }
      return drawCards(prev, player, 1);
    });
  }

  function playCard(player: Player, index: number) {
    setGame((prev) => {
      if (prev.winner || prev.currentPlayer !== player || prev.pendingWild) {
        return prev;
      }
      if (prev.pendingMiniGame) return prev;
      const top = prev.discardPile[prev.discardPile.length - 1].card;
      const hand = player === "player" ? prev.playerHand : prev.aiHand;
      const card = hand[index];
      if (!card) {
        return prev;
      }
      if (prev.pendingDraw2 > 0 && card.value !== "Draw2") {
        return prev;
      }
      if (prev.pendingDraw2 === 0 && !isPlayable(card, top)) {
        return prev;
      }

      const nextHand = hand.filter((_, i) => i !== index);
      let nextState: GameState = {
        ...prev,
        playerHand: player === "player" ? nextHand : prev.playerHand,
        aiHand: player === "ai" ? nextHand : prev.aiHand,
      };

      if (card.value === "RPS" || card.value === "HT") {
        let miniState: GameState = {
          ...nextState,
          discardPile: [...prev.discardPile, { card, player }],
          pendingMiniGame:
            card.value === "RPS"
              ? { type: "rps", player, chosenColor: null }
              : { type: "coin", player, chosenColor: null },
        };
        miniState = addHistoryCard(miniState, card, player);
        return miniState;
      }

      if (card.value === "Wild" || card.value === "Wild4") {
        if (nextHand.length === 0) {
          nextState = finishPlay(nextState, player, card, pickRandomColor());
          nextState.winner = player;
          return nextState;
        }
        let wildState: GameState = {
          ...nextState,
          discardPile: [...prev.discardPile, { card, player }],
          pendingWild: { player, value: card.value },
        };
        wildState = addHistoryCard(wildState, card, player);
        return wildState;
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
      if (prev.winner || prev.pendingWild || prev.pendingMiniGame) return prev;
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
      if (prev.winner || prev.pendingWild || prev.pendingMiniGame) return prev;
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
    }, 5000);
  }

  function notify(message: string) {
    showUnoBanner(message);
    setGame((prev) => addHistoryEvent(prev, message));
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

  function resolveRps(playerChoice: RpsChoice) {
    const aiChoice: RpsChoice =
      (["rock", "paper", "scissors"] as const)[
        Math.floor(Math.random() * 3)
      ];
    setGame((prev) => {
      if (!prev.pendingMiniGame || prev.pendingMiniGame.type !== "rps") {
        return prev;
      }
      if (!prev.pendingMiniGame.chosenColor) {
        return prev;
      }
      const result = resolveRpsWinner(playerChoice, aiChoice);
      const thrower = prev.pendingMiniGame.player;
      const colorToUse = prev.pendingMiniGame.chosenColor;
      if (result === "tie") {
        const nextState = addHistoryEvent(
          { ...prev, pendingMiniGame: null },
          "RPS tie. No penalty.",
        );
        showUnoBanner("RPS tie. No penalty.");
        return nextState;
      }
      const loser: Player = result === "player" ? "ai" : "player";
      let nextState = drawCards(prev, loser, 4);
      nextState = {
        ...nextState,
        pendingMiniGame: null,
        currentPlayer: thrower === "player" ? "ai" : "player",
        actionNonce: nextState.actionNonce + 1,
      };
      nextState = {
        ...nextState,
        discardPile: [
          ...nextState.discardPile.slice(0, -1),
          {
            ...nextState.discardPile[nextState.discardPile.length - 1],
            card: {
              ...nextState.discardPile[nextState.discardPile.length - 1].card,
              color: colorToUse,
            },
          },
        ],
      };
      nextState = addHistoryEvent(
        nextState,
        `RPS: ${playerChoice} vs ${aiChoice}. ${loser} draws 4.`,
      );
      showUnoBanner(`RPS: ${playerChoice} vs ${aiChoice}. ${loser} draws 4.`);
      return nextState;
    });
    setRpsSelection(null);
  }

  function resolveCoin(choice: CoinChoice) {
    const flip: CoinChoice = Math.random() < 0.5 ? "heads" : "tails";
    setGame((prev) => {
      if (!prev.pendingMiniGame || prev.pendingMiniGame.type !== "coin") {
        return prev;
      }
      if (!prev.pendingMiniGame.chosenColor) {
        return prev;
      }
      const thrower = prev.pendingMiniGame.player;
      const colorToUse = prev.pendingMiniGame.chosenColor;
      const throwerWon = choice === flip;
      const loser: Player = throwerWon
        ? thrower === "player"
          ? "ai"
          : "player"
        : thrower;
      const winner: Player = throwerWon ? thrower : loser === "player" ? "ai" : "player";
      const pickedLabel =
        choice === "heads" ? "Heads picked" : "Tails picked";
      const landedLabel =
        flip === "heads" ? "Heads landed" : "Tails landed";
      const winnerLabel = winner === "player" ? "Player" : "AI";
      const loserLabel = loser === "player" ? "player" : "ai";
      const message = `${pickedLabel}, ${landedLabel}, ${winnerLabel} wins, ${loserLabel} draws 3.`;
      let nextState = drawCards(prev, loser, 3);
      nextState = {
        ...nextState,
        pendingMiniGame: null,
        currentPlayer: thrower === "player" ? "ai" : "player",
        actionNonce: nextState.actionNonce + 1,
      };
      nextState = {
        ...nextState,
        discardPile: [
          ...nextState.discardPile.slice(0, -1),
          {
            ...nextState.discardPile[nextState.discardPile.length - 1],
            card: {
              ...nextState.discardPile[nextState.discardPile.length - 1].card,
              color: colorToUse,
            },
          },
        ],
      };
      nextState = addHistoryEvent(nextState, message);
      showUnoBanner(message);
      return nextState;
    });
    setCoinSelection(null);
  }

  useEffect(() => {
    if (winner || currentPlayer !== "ai" || pendingWild || pendingMiniGame) {
      return;
    }
    const timer = setTimeout(() => {
      setGame((prev) => {
        if (
          prev.winner ||
          prev.currentPlayer !== "ai" ||
          prev.pendingWild ||
          prev.pendingMiniGame
        ) {
          return prev;
        }
        if (prev.pendingDraw2 > 0) {
          const draw2Index = prev.aiHand.findIndex(
            (card) => card.value === "Draw2",
          );
          if (draw2Index >= 0) {
            const card = prev.aiHand[draw2Index];
            const nextHand = prev.aiHand.filter((_, i) => i !== draw2Index);
            let nextState: GameState = {
              ...prev,
              aiHand: nextHand,
            };
            nextState = finishPlay(nextState, "ai", card);
            if (nextHand.length === 0) {
              nextState.winner = "ai";
            }
            return nextState;
          }
          let nextState = drawCards(prev, "ai", prev.pendingDraw2);
          nextState = {
            ...nextState,
            pendingDraw2: 0,
            currentPlayer: "player",
            actionNonce: nextState.actionNonce + 1,
          };
          return nextState;
        }
        const top = prev.discardPile[prev.discardPile.length - 1].card;
        const playableIndex = prev.aiHand.findIndex((card) =>
          isPlayable(card, top),
        );

        if (playableIndex === -1) {
          let nextState = prev;
          let drewPlayable = false;
          while (true) {
            nextState = drawCards(nextState, "ai", 1);
            const drawn = nextState.aiHand[nextState.aiHand.length - 1];
            if (!drawn) {
              break;
            }
            if (isPlayable(drawn, top)) {
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
              if (drawn.value === "RPS" || drawn.value === "HT") {
                nextState = addHistoryCard(nextState, drawn, "ai");
                return {
                  ...nextState,
                  discardPile: [...nextState.discardPile, { card: drawn, player: "ai" }],
                  pendingMiniGame:
                    drawn.value === "RPS"
                      ? { type: "rps", player: "ai", chosenColor: null }
                      : { type: "coin", player: "ai", chosenColor: null },
                };
              }
              nextState = finishPlay(nextState, "ai", drawn, chosenColor);
              if (updatedHand.length === 0) {
                nextState.winner = "ai";
              }
              drewPlayable = true;
              break;
            }
            if (nextState.deck.length === 0) {
              break;
            }
          }
          return drewPlayable
            ? nextState
            : { ...nextState, currentPlayer: "player" };
        }

        const card = prev.aiHand[playableIndex];
        const nextHand = prev.aiHand.filter((_, i) => i !== playableIndex);
        let nextState: GameState = {
          ...prev,
          aiHand: nextHand,
        };
        if (card.value === "RPS" || card.value === "HT") {
          nextState = addHistoryCard(nextState, card, "ai");
          return {
            ...nextState,
            discardPile: [...prev.discardPile, { card, player: "ai" }],
            pendingMiniGame:
              card.value === "RPS"
                ? { type: "rps", player: "ai", chosenColor: null }
                : { type: "coin", player: "ai", chosenColor: null },
          };
        }
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
  }, [actionNonce, currentPlayer, pendingMiniGame, pendingWild, winner]);

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
    setRpsSelection(null);
    setCoinSelection(null);
  }, [pendingMiniGame]);

  useEffect(() => {
    if (winner || pendingWild || pendingMiniGame) return;
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
          let nextState: GameState = {
            ...prev,
            unoCalled: { ...prev.unoCalled, ai: true },
          };
          nextState = addHistoryEvent(nextState, "AI called UNO!");
          return nextState;
        });
      }, 1000);
    }
    return () => {
      if (aiAutoUnoTimer.current !== null) {
        window.clearTimeout(aiAutoUnoTimer.current);
        aiAutoUnoTimer.current = null;
      }
    };
  }, [
    pendingMiniGame,
    pendingWild,
    unoCalled.ai,
    unoWindow.ai,
    unoWindow.aiToken,
    winner,
  ]);

  useEffect(() => {
    if (winner || pendingWild || pendingMiniGame) return;
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
          nextState = addHistoryEvent(nextState, "AI called UNO on you. Draw 2.");
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
  }, [
    pendingMiniGame,
    pendingWild,
    unoCalled.player,
    unoWindow.player,
    unoWindow.playerToken,
    winner,
  ]);

  useEffect(() => {
    if (!pendingMiniGame || pendingMiniGame.type !== "coin") return;
    if (pendingMiniGame.player !== "ai") return;
    const timer = setTimeout(() => {
      const aiChoice: CoinChoice = Math.random() < 0.5 ? "heads" : "tails";
      setGame((prev) => {
        if (!prev.pendingMiniGame || prev.pendingMiniGame.type !== "coin") {
          return prev;
        }
        return {
          ...prev,
          pendingMiniGame: {
            ...prev.pendingMiniGame,
            chosenColor: pickBestColor(prev.aiHand),
          },
        };
      });
      resolveCoin(aiChoice);
    }, 600);
    return () => clearTimeout(timer);
  }, [pendingMiniGame]);

  useEffect(() => {
    if (!pendingMiniGame || pendingMiniGame.type !== "rps") return;
    if (pendingMiniGame.player !== "ai") return;
    if (pendingMiniGame.chosenColor) return;
    setGame((prev) => {
      if (!prev.pendingMiniGame || prev.pendingMiniGame.type !== "rps") {
        return prev;
      }
      if (prev.pendingMiniGame.chosenColor) return prev;
      return {
        ...prev,
        pendingMiniGame: {
          ...prev.pendingMiniGame,
          chosenColor: pickBestColor(prev.aiHand),
        },
      };
    });
  }, [pendingMiniGame]);

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-4 pb-28 lg:py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">
            Chill Coding Lounge
          </div>
          <div className="text-2xl font-semibold">Chillno Table</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-md bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
            onClick={resetGame}
          >
            Restart
          </button>
          <button
            className="rounded-md bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
            onClick={() => setShowExitModal(true)}
          >
            Back
          </button>
          <button
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
            onClick={() => drawCard("player")}
            disabled={
              currentPlayer !== "player" ||
              !!winner ||
              !!pendingWild ||
              !!pendingMiniGame ||
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
                notify("You called UNO!");
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
                notify("UNO called on AI. It draws 2.");
              }
            }}
            disabled={!unoWindow.ai || unoCalled.ai}
          >
            Call UNO (AI)
          </button>
        </div>
      </div>

      <div className="mt-4 grid flex-1 gap-6 lg:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-sm text-slate-400">AI</div>
          <div className="text-xs text-slate-500">Cards: {aiHand.length}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {aiHand.map((_, index) => (
              <div
                key={`ai-${index}`}
                className="h-24 w-16 rounded-lg bg-slate-800/80 ring-1 ring-slate-700"
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="text-sm text-slate-400">Discard</div>
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
          <div className="text-xs text-slate-400">Deck: {deck.length} cards</div>
          <div className="text-xs text-slate-400">Turn: {currentPlayer}</div>
          {pendingDraw2 > 0 && (
            <div className="text-xs text-amber-300">
              Pending Draw2 stack: {pendingDraw2}
            </div>
          )}
          {winner && (
            <div className="rounded-full bg-amber-500/20 px-4 py-2 text-sm text-amber-300">
              Winner: {winner}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-sm text-slate-400">You</div>
          <div className="text-xs text-slate-500">Cards: {playerHand.length}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {playerHand.map((val, index) => (
              <button
                key={`${val.color}-${val.value}-${index}`}
                onClick={() => playCard("player", index)}
                disabled={
                  currentPlayer !== "player" ||
                  !!winner ||
                  pendingWild !== null ||
                  pendingMiniGame !== null ||
                  !isPlayableForTurn(val, topCard, pendingDraw2)
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

      {pendingMiniGame && pendingMiniGame.type === "rps" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-200">
            <div className="text-base font-semibold text-slate-100">
              Rock, Paper, Scissors
            </div>
            <div className="mt-2 text-slate-400">
              Choose your move. Winner decides the outcome.
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
                      setGame((prev) => {
                        if (
                          !prev.pendingMiniGame ||
                          prev.pendingMiniGame.type !== "rps"
                        ) {
                          return prev;
                        }
                        return {
                          ...prev,
                          pendingMiniGame: {
                            ...prev.pendingMiniGame,
                            chosenColor: color,
                          },
                        };
                      })
                    }
                    disabled={pendingMiniGame.player !== "player"}
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
                    } ${pendingMiniGame.player !== "player" ? "opacity-50" : ""}`}
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
                  }`}
                  onClick={() => setRpsSelection(choice)}
                >
                  {choice}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                onClick={() => {
                  if (rpsSelection && pendingMiniGame?.chosenColor) {
                    resolveRps(rpsSelection);
                  }
                }}
                disabled={!rpsSelection || !pendingMiniGame?.chosenColor}
              >
                Play
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
              {pendingMiniGame.player === "player"
                ? "Pick heads or tails."
                : "AI is choosing a side."}
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
                      setGame((prev) => {
                        if (
                          !prev.pendingMiniGame ||
                          prev.pendingMiniGame.type !== "coin"
                        ) {
                          return prev;
                        }
                        return {
                          ...prev,
                          pendingMiniGame: {
                            ...prev.pendingMiniGame,
                            chosenColor: color,
                          },
                        };
                      })
                    }
                    disabled={pendingMiniGame.player !== "player"}
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
                    }`}
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
                  }`}
                  onClick={() => setCoinSelection(choice)}
                  disabled={pendingMiniGame.player !== "player"}
                >
                  {choice}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              {pendingMiniGame.player === "player" ? (
                <button
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                  onClick={() => {
                    if (coinSelection && pendingMiniGame?.chosenColor) {
                      resolveCoin(coinSelection);
                    }
                  }}
                  disabled={!coinSelection || !pendingMiniGame?.chosenColor}
                >
                  Flip
                </button>
              ) : (
                <button
                  className="rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-400"
                  disabled
                >
                  Waiting...
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {unoBanner && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {unoBanner}
        </div>
      )}

      <details className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <summary className="cursor-pointer text-sm text-slate-400">
          Discard History
        </summary>
        <div className="mt-3 max-h-48 space-y-2 overflow-auto text-xs text-slate-300">
          {[...game.history]
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
                      {entry.player === "player" ? "You" : "AI"}
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

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <button
            className="rounded-md bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
            onClick={resetGame}
          >
            Restart
          </button>
          <button
            className="rounded-md bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
            onClick={() => setShowExitModal(true)}
          >
            Back
          </button>
          <button
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
            onClick={() => drawCard("player")}
            disabled={
              currentPlayer !== "player" ||
              !!winner ||
              !!pendingWild ||
              !!pendingMiniGame ||
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
                notify("You called UNO!");
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
                notify("UNO called on AI. It draws 2.");
              }
            }}
            disabled={!unoWindow.ai || unoCalled.ai}
          >
            Call UNO (AI)
          </button>
        </div>
      </div>

      {showExitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-200">
            <div className="text-base font-semibold text-slate-100">
              Leave the game?
            </div>
            <div className="mt-2 text-slate-400">
              Your current game will be lost.
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="rounded-md bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                onClick={() => setShowExitModal(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-amber-500 px-3 py-2 text-sm text-black hover:bg-amber-400"
                onClick={onBack}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
