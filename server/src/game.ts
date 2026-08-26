import type {
  CardValue,
  Color,
  CoinChoice,
  DeckCard,
  GameState,
  PendingMiniGame,
  PlayerId,
  RpsChoice,
  Room,
} from "./types.js";

const COLORS: Color[] = ["red", "yellow", "green", "blue"];

export function shuffleArray<T>(array: T[]): T[] {
  let currentIndex = array.length;
  while (currentIndex !== 0) {
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
}

export function generateDeck(): DeckCard[] {
  const colors: Color[] = ["blue", "green", "red", "yellow"];
  const normalValue: CardValue[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const actionValue: CardValue[] = ["Skip", "Reverse", "Draw2"];
  const deck: DeckCard[] = [];

  for (const color of colors) {
    deck.push({ color, value: 0 });
    for (const n of normalValue.slice(1)) {
      deck.push({ color, value: n });
      deck.push({ color, value: n });
    }
    for (const a of actionValue) {
      deck.push({ color, value: a });
      deck.push({ color, value: a });
    }
  }

  for (let i = 0; i < 4; i += 1) {
    deck.push({ color: "wild", value: "Wild" });
    deck.push({ color: "wild", value: "Wild4" });
  }
  for (let i = 0; i < 4; i += 1) {
    deck.push({ color: "wild", value: "RPS" });
    deck.push({ color: "wild", value: "HT" });
  }

  return shuffleArray(deck);
}

export function pickRandomColor(): Color {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function isPlayable(card: DeckCard, top: DeckCard): boolean {
  if (card.color === "wild" || card.value === "Wild" || card.value === "Wild4") {
    return true;
  }
  if (card.value === "RPS" || card.value === "HT") {
    return true;
  }
  return card.color === top.color || card.value === top.value;
}

export function isPlayableForTurn(
  card: DeckCard,
  top: DeckCard,
  pendingDraw2: number,
): boolean {
  if (pendingDraw2 > 0) {
    return card.value === "Draw2";
  }
  return isPlayable(card, top);
}

export function resolveRpsWinner(
  playerChoice: RpsChoice,
  opponentChoice: RpsChoice,
): "thrower" | "target" | "tie" {
  if (playerChoice === opponentChoice) return "tie";
  if (
    (playerChoice === "rock" && opponentChoice === "scissors") ||
    (playerChoice === "paper" && opponentChoice === "rock") ||
    (playerChoice === "scissors" && opponentChoice === "paper")
  ) {
    return "thrower";
  }
  return "target";
}

export function initGame(room: Room): GameState {
  const deck = generateDeck();
  const hands: Record<PlayerId, DeckCard[]> = {};
  for (const player of room.players) {
    hands[player.id] = deck.splice(0, 7);
  }
  let discard = deck.shift();
  if (!discard) {
    discard = { color: "red", value: 0 };
  }
  if (discard.color === "wild") {
    discard = { ...discard, color: pickRandomColor() };
  }

  const unoCalled: Record<PlayerId, boolean> = {};
  const unoWindow: Record<PlayerId, { open: boolean; token: number }> = {};
  for (const player of room.players) {
    unoCalled[player.id] = true;
    unoWindow[player.id] = { open: false, token: 0 };
  }

  return {
    deck,
    discardPile: [{ card: discard, playerId: room.players[0].id }],
    hands,
    history: [
      { id: 0, type: "card", card: discard, playerId: room.players[0].id },
    ],
    historyCounter: 1,
    currentPlayerIndex: 0,
    direction: 1,
    pendingWild: null,
    pendingDraw2: 0,
    pendingMiniGame: null,
    miniGameResult: null,
    winnerId: null,
    unoCalled,
    unoWindow,
  };
}

export function advanceIndex(
  room: Room,
  fromIndex: number,
  steps: number,
): number {
  const count = room.players.length;
  const dir = room.state.direction;
  const next = (fromIndex + steps * dir + count * 10) % count;
  return next;
}

export function currentPlayerId(room: Room): PlayerId {
  return room.players[room.state.currentPlayerIndex]?.id ?? room.players[0].id;
}

export function addHistoryCard(
  state: GameState,
  card: DeckCard,
  playerId: PlayerId,
): GameState {
  return {
    ...state,
    history: [
      ...state.history,
      { id: state.historyCounter, type: "card", card, playerId },
    ],
    historyCounter: state.historyCounter + 1,
  };
}

export function addHistoryEvent(state: GameState, text: string): GameState {
  return {
    ...state,
    history: [
      ...state.history,
      { id: state.historyCounter, type: "event", text },
    ],
    historyCounter: state.historyCounter + 1,
  };
}

export function refillDeckIfNeeded(
  deck: DeckCard[],
  discardPile: { card: DeckCard; playerId: PlayerId }[],
): { deck: DeckCard[]; discardPile: { card: DeckCard; playerId: PlayerId }[] } {
  if (deck.length > 0 || discardPile.length <= 1) {
    return { deck, discardPile };
  }
  const top = discardPile[discardPile.length - 1];
  const newDeck = shuffleArray(
    discardPile.slice(0, -1).map((entry) => entry.card),
  );
  return { deck: newDeck, discardPile: [top] };
}

export function drawCards(
  state: GameState,
  playerId: PlayerId,
  count: number,
): GameState {
  let deck = [...state.deck];
  let discardPile = [...state.discardPile];
  const hands = { ...state.hands };
  const playerHand = [...(hands[playerId] ?? [])];

  for (let i = 0; i < count; i += 1) {
    ({ deck, discardPile } = refillDeckIfNeeded(deck, discardPile));
    if (deck.length === 0) break;
    const [drawn, ...rest] = deck;
    deck = rest;
    playerHand.push(drawn);
  }

  hands[playerId] = playerHand;
  return { ...state, deck, discardPile, hands };
}

export function finishPlay(
  room: Room,
  state: GameState,
  playerId: PlayerId,
  card: DeckCard,
  chosenColor?: Color,
): GameState {
  const isTwoPlayers = room.players.length === 2;
  const cardToDiscard =
    card.color === "wild"
      ? { ...card, color: chosenColor ?? pickRandomColor() }
      : card;
  let nextState: GameState = {
    ...state,
    discardPile: [...state.discardPile, { card: cardToDiscard, playerId }],
  };
  nextState = addHistoryCard(nextState, cardToDiscard, playerId);

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

  const currentIndex = room.players.findIndex((p) => p.id === playerId);
  const nextIndex = advanceIndex(
    { ...room, state: nextState },
    currentIndex,
    1,
  );
  const nextPlayer = room.players[nextIndex]?.id ?? playerId;

  if (drawCount > 0) {
    nextState = drawCards(nextState, nextPlayer, drawCount);
  }

  if (card.value === "Draw2") {
    nextState.currentPlayerIndex = nextIndex;
  } else if (skip) {
    nextState.currentPlayerIndex = advanceIndex(
      { ...room, state: nextState },
      currentIndex,
      2,
    );
  } else {
    nextState.currentPlayerIndex = nextIndex;
  }

  nextState.pendingDraw2 = pendingDraw2;
  return nextState;
}

export function updateUnoWindows(
  room: Room,
  state: GameState,
): GameState {
  if (state.winnerId) {
    const unoCalled = { ...state.unoCalled };
    const unoWindow = { ...state.unoWindow };
    for (const player of room.players) {
      unoCalled[player.id] = true;
      unoWindow[player.id] = {
        ...(unoWindow[player.id] ?? { token: 0 }),
        open: false,
      };
    }
    return { ...state, unoCalled, unoWindow };
  }
  let nextState = state;
  for (const player of room.players) {
    const hand = nextState.hands[player.id] ?? [];
    const window = nextState.unoWindow[player.id];
    if (
      hand.length === 1 &&
      !window.open &&
      !nextState.pendingWild &&
      !nextState.pendingMiniGame
    ) {
      nextState = {
        ...nextState,
        unoWindow: {
          ...nextState.unoWindow,
          [player.id]: { open: true, token: window.token + 1 },
        },
        unoCalled: { ...nextState.unoCalled, [player.id]: false },
      };
    }
    if (hand.length !== 1 && window.open) {
      nextState = {
        ...nextState,
        unoWindow: {
          ...nextState.unoWindow,
          [player.id]: { ...window, open: false },
        },
        unoCalled: { ...nextState.unoCalled, [player.id]: true },
      };
    }
  }
  return nextState;
}

export function resolveRps(
  room: Room,
  state: GameState,
  pending: PendingMiniGame,
): GameState {
  if (pending.type !== "rps") return state;
  if (!pending.chosenColor) return state;
  if (!pending.throwerChoice || !pending.targetChoice) return state;

  const result = resolveRpsWinner(pending.throwerChoice, pending.targetChoice);
  let nextState = state;
  if (result === "tie") {
    nextState = addHistoryEvent(
      { ...nextState, pendingMiniGame: null, miniGameResult: {
        type: "rps", throwerId: pending.throwerId, targetId: pending.targetId,
        throwerChoice: pending.throwerChoice, targetChoice: pending.targetChoice,
        winnerId: null, loserId: null, penalty: 0, revealUntil: Date.now() + 3000,
      } },
      "RPS tie. No penalty.",
    );
  } else {
    const loserId = result === "thrower" ? pending.targetId : pending.throwerId;
    const loserName =
      room.players.find((player) => player.id === loserId)?.name ?? "Player";
    nextState = drawCards(nextState, loserId, 4);
    nextState = {
      ...nextState,
      pendingMiniGame: null,
      miniGameResult: {
        type: "rps", throwerId: pending.throwerId, targetId: pending.targetId,
        throwerChoice: pending.throwerChoice, targetChoice: pending.targetChoice,
        winnerId: result === "thrower" ? pending.throwerId : pending.targetId,
        loserId, penalty: 4, revealUntil: Date.now() + 3000,
      },
    };
    nextState = addHistoryEvent(
      nextState,
      `RPS: ${pending.throwerChoice} vs ${pending.targetChoice}. ${loserName} draws 4.`,
    );
  }

  const throwerIndex = room.players.findIndex(
    (p) => p.id === pending.throwerId,
  );
  nextState.currentPlayerIndex = advanceIndex(
    { ...room, state: nextState },
    throwerIndex,
    1,
  );
  nextState = {
    ...nextState,
    discardPile: [
      ...nextState.discardPile.slice(0, -1),
      {
        ...nextState.discardPile[nextState.discardPile.length - 1],
        card: {
          ...nextState.discardPile[nextState.discardPile.length - 1].card,
          color: pending.chosenColor,
        },
      },
    ],
  };
  return nextState;
}

export function resolveCoin(
  room: Room,
  state: GameState,
  pending: PendingMiniGame,
): GameState {
  if (pending.type !== "coin") return state;
  if (!pending.chosenColor) return state;
  if (!pending.throwerChoice) return state;

  const flip: CoinChoice = Math.random() < 0.5 ? "heads" : "tails";
  const throwerWon = pending.throwerChoice === flip;
  const loserId = throwerWon ? pending.targetId : pending.throwerId;
  const winnerId = throwerWon ? pending.throwerId : pending.targetId;
  const winnerName =
    room.players.find((player) => player.id === winnerId)?.name ?? "Player";
  const loserName =
    room.players.find((player) => player.id === loserId)?.name ?? "Player";
  const pickedLabel =
    pending.throwerChoice === "heads" ? "Heads picked" : "Tails picked";
  const landedLabel = flip === "heads" ? "Heads landed" : "Tails landed";
  const message = `${pickedLabel}, ${landedLabel}, ${winnerName} wins, ${loserName} draws 3.`;

  let nextState = drawCards(state, loserId, 3);
  nextState = {
    ...nextState,
    pendingMiniGame: null,
    miniGameResult: {
      type: "coin", throwerId: pending.throwerId, targetId: pending.targetId,
      choice: pending.throwerChoice, landed: flip, winnerId, loserId,
      penalty: 3, revealUntil: Date.now() + 3000,
    },
  };
  const throwerIndex = room.players.findIndex(
    (p) => p.id === pending.throwerId,
  );
  nextState.currentPlayerIndex = advanceIndex(
    { ...room, state: nextState },
    throwerIndex,
    1,
  );
  nextState = {
    ...nextState,
    discardPile: [
      ...nextState.discardPile.slice(0, -1),
      {
        ...nextState.discardPile[nextState.discardPile.length - 1],
        card: {
          ...nextState.discardPile[nextState.discardPile.length - 1].card,
          color: pending.chosenColor,
        },
      },
    ],
  };
  nextState = addHistoryEvent(nextState, message);
  return nextState;
}
