import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import {
  addHistoryEvent,
  addHistoryCard,
  advanceIndex,
  currentPlayerId,
  drawCards,
  finishPlay,
  initGame,
  isPlayableForTurn,
  resolveCoin,
  resolveRps,
  updateUnoWindows,
} from "./game";
import type {
  CoinChoice,
  DeckCard,
  PendingMiniGame,
  PlayerId,
  Room,
  RpsChoice,
} from "./types";

type ClientMessage =
  | { type: "hello"; name?: string }
  | { type: "set_name"; name: string }
  | { type: "join_lobby"; desiredPlayers: 2 | 3 | 4 }
  | { type: "leave_lobby" }
  | { type: "leave_room" }
  | {
      type: "action";
      action:
        | { type: "draw" }
        | { type: "play"; index: number }
        | { type: "choose_wild"; color: "red" | "yellow" | "green" | "blue" }
        | { type: "set_mini_color"; color: "red" | "yellow" | "green" | "blue" }
        | { type: "rps_choice"; choice: RpsChoice }
        | { type: "coin_choice"; choice: CoinChoice }
        | { type: "call_uno_self" }
        | { type: "call_uno_on"; targetId: PlayerId };
    };

type ServerMessage =
  | { type: "connected"; id: PlayerId; name: string }
  | {
      type: "lobby_state";
      queues: { size: 2 | 3 | 4; waiting: number }[];
    }
  | { type: "queue_joined"; size: 2 | 3 | 4; waiting: number }
  | {
      type: "room_joined";
      roomId: string;
      youId: PlayerId;
      state: PublicState;
      hand: DeckCard[];
    }
  | {
      type: "state";
      state: PublicState;
      hand: DeckCard[];
    }
  | { type: "room_closed"; reason: string }
  | { type: "error"; message: string };

type PublicState = {
  roomId: string;
  players: {
    id: PlayerId;
    name: string;
    handCount: number;
    unoWindow: boolean;
    unoCalled: boolean;
    disconnected: boolean;
  }[];
  currentPlayerId: PlayerId;
  direction: 1 | -1;
  pendingDraw2: number;
  pendingWild: { playerId: PlayerId; value: "Wild" | "Wild4" } | null;
  pendingMiniGame:
    | {
        type: "rps";
        throwerId: PlayerId;
        targetId: PlayerId;
        chosenColor: "red" | "yellow" | "green" | "blue" | null;
        throwerChosen: boolean;
        targetChosen: boolean;
      }
    | {
        type: "coin";
        throwerId: PlayerId;
        targetId: PlayerId;
        chosenColor: "red" | "yellow" | "green" | "blue" | null;
        throwerChosen: boolean;
      }
    | null;
  winnerId: PlayerId | null;
  discardTop: DeckCard;
  history: (
    | { id: number; type: "card"; card: DeckCard; playerId: PlayerId }
    | { id: number; type: "event"; text: string }
  )[];
};

type ClientInfo = {
  id: PlayerId;
  name: string;
  ws: WebSocket;
  roomId: string | null;
  queueSize: 2 | 3 | 4 | null;
};

const PORT = Number(process.env.PORT ?? 8787);
const wss = new WebSocketServer({ port: PORT });
const clients = new Map<WebSocket, ClientInfo>();
const rooms = new Map<string, Room>();
const queues: Record<2 | 3 | 4, PlayerId[]> = { 2: [], 3: [], 4: [] };

function send(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function playerName(room: Room, id: PlayerId) {
  return room.players.find((p) => p.id === id)?.name ?? "Player";
}

function broadcastLobbyState() {
  const message: ServerMessage = {
    type: "lobby_state",
    queues: [
      { size: 2, waiting: queues[2].length },
      { size: 3, waiting: queues[3].length },
      { size: 4, waiting: queues[4].length },
    ],
  };
  for (const client of clients.values()) {
    if (!client.roomId) {
      send(client.ws, message);
    }
  }
}

function buildPublicState(room: Room): PublicState {
  const top = room.state.discardPile[room.state.discardPile.length - 1];
  const pending = room.state.pendingMiniGame;
  const pendingMiniGame: PublicState["pendingMiniGame"] =
    pending?.type === "rps"
      ? {
          type: "rps",
          throwerId: pending.throwerId,
          targetId: pending.targetId,
          chosenColor: pending.chosenColor,
          throwerChosen: !!pending.throwerChoice,
          targetChosen: !!pending.targetChoice,
        }
      : pending?.type === "coin"
        ? {
            type: "coin",
            throwerId: pending.throwerId,
            targetId: pending.targetId,
            chosenColor: pending.chosenColor,
            throwerChosen: !!pending.throwerChoice,
          }
        : null;

  return {
    roomId: room.id,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      handCount: room.state.hands[player.id]?.length ?? 0,
      unoWindow: room.state.unoWindow[player.id]?.open ?? false,
      unoCalled: room.state.unoCalled[player.id] ?? true,
      disconnected: !player.connected,
    })),
    currentPlayerId: currentPlayerId(room),
    direction: room.state.direction,
    pendingDraw2: room.state.pendingDraw2,
    pendingWild: room.state.pendingWild,
    pendingMiniGame,
    winnerId: room.state.winnerId,
    discardTop: top.card,
    history: room.state.history.slice(-25),
  };
}

function pushRoomState(room: Room) {
  for (const player of room.players) {
    const client = [...clients.values()].find((c) => c.id === player.id);
    if (!client) continue;
    send(client.ws, {
      type: "state",
      state: buildPublicState(room),
      hand: room.state.hands[player.id] ?? [],
    });
  }
}

function closeRoom(room: Room, reason: string) {
  for (const player of room.players) {
    const client = [...clients.values()].find((c) => c.id === player.id);
    if (client) {
      client.roomId = null;
      send(client.ws, { type: "room_closed", reason });
    }
  }
  rooms.delete(room.id);
}

function removeFromQueues(playerId: PlayerId) {
  (Object.keys(queues) as Array<"2" | "3" | "4">).forEach((key) => {
    const size = Number(key) as 2 | 3 | 4;
    queues[size] = queues[size].filter((id) => id !== playerId);
  });
}

function startRoom(room: Room) {
  room.status = "playing";
  room.state = initGame(room);
  pushRoomState(room);
}

function tryCreateRoom(size: 2 | 3 | 4) {
  if (queues[size].length < size) return;
  const players = queues[size].splice(0, size);
  const roomId = randomUUID();
  const roomPlayers = players.map((id) => {
    const client = [...clients.values()].find((c) => c.id === id);
    return {
      id,
      name: client?.name ?? "Guest",
      connected: !!client,
      hand: [],
    };
  });
  const room: Room = {
    id: roomId,
    size,
    players: roomPlayers,
    state: {
      deck: [],
      discardPile: [],
      hands: {},
      history: [],
      historyCounter: 0,
      currentPlayerIndex: 0,
      direction: 1,
      pendingWild: null,
      pendingDraw2: 0,
      pendingMiniGame: null,
      winnerId: null,
      unoCalled: {},
      unoWindow: {},
    },
    status: "lobby",
  };
  rooms.set(roomId, room);
  for (const playerId of players) {
    const client = [...clients.values()].find((c) => c.id === playerId);
    if (client) {
      client.roomId = roomId;
      client.queueSize = null;
    }
  }
  startRoom(room);
  for (const playerId of players) {
    const client = [...clients.values()].find((c) => c.id === playerId);
    if (client) {
      send(client.ws, {
        type: "room_joined",
        roomId,
        youId: client.id,
        state: buildPublicState(room),
        hand: room.state.hands[client.id] ?? [],
      });
    }
  }
  broadcastLobbyState();
}

function withRoom(client: ClientInfo, handler: (room: Room) => void) {
  if (!client.roomId) {
    send(client.ws, { type: "error", message: "Not in a room." });
    return;
  }
  const room = rooms.get(client.roomId);
  if (!room) {
    send(client.ws, { type: "error", message: "Room not found." });
    return;
  }
  handler(room);
}

function applyPendingResolution(room: Room, pending: PendingMiniGame) {
  if (pending.type === "rps") {
    room.state = resolveRps(room, room.state, pending);
  } else if (pending.type === "coin") {
    room.state = resolveCoin(room, room.state, pending);
  }
  room.state = updateUnoWindows(room, room.state);
}

wss.on("connection", (ws) => {
  const id = randomUUID();
  const client: ClientInfo = {
    id,
    name: "Guest",
    ws,
    roomId: null,
    queueSize: null,
  };
  clients.set(ws, client);
  send(ws, { type: "connected", id, name: client.name });
  broadcastLobbyState();

  ws.on("message", (data) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(data.toString());
    } catch {
      send(ws, { type: "error", message: "Invalid message." });
      return;
    }

    if (message.type === "hello") {
      if (message.name && message.name.trim().length > 0) {
        client.name = message.name.trim().slice(0, 24);
      }
      send(ws, { type: "connected", id: client.id, name: client.name });
      return;
    }

    if (message.type === "set_name") {
      client.name = message.name.trim().slice(0, 24) || "Guest";
      send(ws, { type: "connected", id: client.id, name: client.name });
      return;
    }

    if (message.type === "join_lobby") {
      removeFromQueues(client.id);
      const size = message.desiredPlayers;
      queues[size].push(client.id);
      client.queueSize = size;
      send(ws, { type: "queue_joined", size, waiting: queues[size].length });
      tryCreateRoom(size);
      broadcastLobbyState();
      return;
    }

    if (message.type === "leave_lobby") {
      removeFromQueues(client.id);
      client.queueSize = null;
      broadcastLobbyState();
      return;
    }

    if (message.type === "leave_room") {
      withRoom(client, (room) => {
        room.players = room.players.filter((p) => p.id !== client.id);
        delete room.state.hands[client.id];
        delete room.state.unoCalled[client.id];
        delete room.state.unoWindow[client.id];
        if (room.players.length < 2) {
          closeRoom(room, "Room closed (not enough players).");
          return;
        }
        room.state = addHistoryEvent(
          room.state,
          `${client.name} left the room.`,
        );
        if (room.state.currentPlayerIndex >= room.players.length) {
          room.state.currentPlayerIndex = 0;
        }
        pushRoomState(room);
      });
      client.roomId = null;
      broadcastLobbyState();
      return;
    }

    if (message.type === "action") {
      withRoom(client, (room) => {
        if (room.state.winnerId) {
          send(ws, { type: "error", message: "Game is finished." });
          return;
        }
        const playerId = client.id;
        const isTurn = currentPlayerId(room) === playerId;

        if (message.action.type === "draw") {
          if (!isTurn) return;
          if (room.state.pendingWild || room.state.pendingMiniGame) return;
          if (room.state.pendingDraw2 > 0) {
            const count = room.state.pendingDraw2;
            room.state = drawCards(room.state, playerId, count);
            room.state.pendingDraw2 = 0;
            const index = room.players.findIndex((p) => p.id === playerId);
            room.state.currentPlayerIndex = advanceIndex(room, index, 1);
            room.state = addHistoryEvent(
              room.state,
              `${client.name} drew ${count} cards.`,
            );
          } else {
            room.state = drawCards(room.state, playerId, 1);
          }
          room.state = updateUnoWindows(room, room.state);
          pushRoomState(room);
          return;
        }

        if (message.action.type === "play") {
          if (!isTurn) return;
          if (room.state.pendingWild || room.state.pendingMiniGame) return;
          const hand = room.state.hands[playerId] ?? [];
          const card = hand[message.action.index];
          if (!card) return;
          const top = room.state.discardPile[room.state.discardPile.length - 1].card;
          if (!isPlayableForTurn(card, top, room.state.pendingDraw2)) return;
          if (room.state.pendingDraw2 > 0 && card.value !== "Draw2") return;

          const nextHand = hand.filter((_, i) => i !== message.action.index);
          room.state.hands[playerId] = nextHand;

          if (card.value === "RPS" || card.value === "HT") {
            const currentIndex = room.players.findIndex((p) => p.id === playerId);
            const targetIndex = (currentIndex + room.state.direction + room.players.length) % room.players.length;
            const targetId = room.players[targetIndex].id;
            room.state = addHistoryCard(room.state, card, playerId);
            room.state = {
              ...room.state,
              discardPile: [...room.state.discardPile, { card, playerId }],
              pendingMiniGame:
                card.value === "RPS"
                  ? {
                      type: "rps",
                      throwerId: playerId,
                      targetId,
                      chosenColor: null,
                      throwerChoice: null,
                      targetChoice: null,
                    }
                  : {
                      type: "coin",
                      throwerId: playerId,
                      targetId,
                      chosenColor: null,
                      throwerChoice: null,
                    },
            };
            room.state = updateUnoWindows(room, room.state);
            pushRoomState(room);
            return;
          }

          if (card.value === "Wild" || card.value === "Wild4") {
            if (nextHand.length === 0) {
              room.state = finishPlay(room, room.state, playerId, card);
              room.state.winnerId = playerId;
              room.state = updateUnoWindows(room, room.state);
              pushRoomState(room);
              return;
            }
            room.state = {
              ...room.state,
              discardPile: [...room.state.discardPile, { card, playerId }],
              pendingWild: { playerId, value: card.value },
            };
            room.state = updateUnoWindows(room, room.state);
            pushRoomState(room);
            return;
          }

          room.state = finishPlay(room, room.state, playerId, card);
          if (nextHand.length === 0) {
            room.state.winnerId = playerId;
          }
          room.state = updateUnoWindows(room, room.state);
          pushRoomState(room);
          return;
        }

        if (message.action.type === "choose_wild") {
          const pending = room.state.pendingWild;
          if (!pending || pending.playerId !== playerId) return;
          const last = room.state.discardPile[room.state.discardPile.length - 1];
          const updatedDiscard = { ...last.card, color: message.action.color };
          room.state = {
            ...room.state,
            discardPile: room.state.discardPile.slice(0, -1),
            pendingWild: null,
          };
          room.state = finishPlay(room, room.state, playerId, updatedDiscard, message.action.color);
          if ((room.state.hands[playerId] ?? []).length === 0) {
            room.state.winnerId = playerId;
          }
          room.state = updateUnoWindows(room, room.state);
          pushRoomState(room);
          return;
        }

        if (message.action.type === "set_mini_color") {
          const pending = room.state.pendingMiniGame;
          if (!pending || pending.throwerId !== playerId) return;
          room.state.pendingMiniGame = { ...pending, chosenColor: message.action.color } as PendingMiniGame;
          pushRoomState(room);
          return;
        }

        if (message.action.type === "rps_choice") {
          const pending = room.state.pendingMiniGame;
          if (!pending || pending.type !== "rps") return;
          if (pending.throwerId !== playerId && pending.targetId !== playerId) return;
          const updated =
            pending.throwerId === playerId
              ? { ...pending, throwerChoice: message.action.choice }
              : { ...pending, targetChoice: message.action.choice };
          room.state.pendingMiniGame = updated;
          if (updated.chosenColor && updated.throwerChoice && updated.targetChoice) {
            applyPendingResolution(room, updated);
          }
          pushRoomState(room);
          return;
        }

        if (message.action.type === "coin_choice") {
          const pending = room.state.pendingMiniGame;
          if (!pending || pending.type !== "coin") return;
          if (pending.throwerId !== playerId) return;
          const updated = { ...pending, throwerChoice: message.action.choice };
          room.state.pendingMiniGame = updated;
          if (updated.chosenColor && updated.throwerChoice) {
            applyPendingResolution(room, updated);
          }
          pushRoomState(room);
          return;
        }

        if (message.action.type === "call_uno_self") {
          const hand = room.state.hands[playerId] ?? [];
          if (hand.length !== 1) return;
          if (room.state.unoCalled[playerId]) return;
          room.state = {
            ...room.state,
            unoCalled: { ...room.state.unoCalled, [playerId]: true },
          };
          room.state = addHistoryEvent(
            room.state,
            `${client.name} called UNO!`,
          );
          pushRoomState(room);
          return;
        }

        if (message.action.type === "call_uno_on") {
          const targetId = message.action.targetId;
          const hand = room.state.hands[targetId] ?? [];
          if (hand.length !== 1) return;
          if (room.state.unoCalled[targetId]) return;
          room.state = drawCards(room.state, targetId, 2);
          room.state = {
            ...room.state,
            unoCalled: { ...room.state.unoCalled, [targetId]: true },
            unoWindow: {
              ...room.state.unoWindow,
              [targetId]: { ...room.state.unoWindow[targetId], open: false },
            },
          };
          room.state = addHistoryEvent(
            room.state,
            `${client.name} called UNO on ${playerName(room, targetId)}.`,
          );
          room.state = updateUnoWindows(room, room.state);
          pushRoomState(room);
          return;
        }
      });
    }
  });

  ws.on("close", () => {
    removeFromQueues(client.id);
    if (client.roomId) {
      const room = rooms.get(client.roomId);
      if (room) {
        const player = room.players.find((p) => p.id === client.id);
        if (player) {
          player.connected = false;
        }
        room.state = addHistoryEvent(
          room.state,
          `${client.name} disconnected.`,
        );
        if (room.players.length < 2) {
          closeRoom(room, "Room closed (not enough players).");
        } else {
          pushRoomState(room);
        }
      }
    }
    clients.delete(ws);
    broadcastLobbyState();
  });
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);
