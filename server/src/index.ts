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
} from "./game.js";
import type {
  CoinChoice,
  DeckCard,
  PendingMiniGame,
  MiniGameResult,
  PlayerId,
  Room,
  RpsChoice,
} from "./types.js";
import { canPlayFinalCard } from "../../shared/rules.js";

type ClientMessage =
  | { type: "hello"; name?: string; sessionToken: string }
  | { type: "set_name"; name: string }
  | { type: "join_lobby"; desiredPlayers: 2 | 3 | 4 }
  | { type: "create_private"; desiredPlayers: 2 | 3 | 4 }
  | { type: "join_private"; code: string }
  | { type: "leave_lobby" }
  | { type: "leave_room" }
  | { type: "play_again" }
  | { type: "chat"; text: string }
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
  | { type: "connected"; id: PlayerId; name: string; sessionToken: string; resumed: boolean }
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
  roomCode: string | null;
  roomSize: number;
  isPrivate: boolean;
  status: "lobby" | "playing" | "finished";
  rematchVotes: PlayerId[];
  chat: {
    id: number;
    playerId: PlayerId;
    name: string;
    text: string;
    timestamp: number;
  }[];
  players: {
    id: PlayerId;
    name: string;
    handCount: number;
    unoWindow: boolean;
    unoCalled: boolean;
    disconnected: boolean;
    reconnectDeadline: number | null;
  }[];
} & (
  | { status: "lobby" }
  | {
      status: "playing" | "finished";
      currentPlayerId: PlayerId;
      direction: 1 | -1;
      pendingDraw2: number;
      pendingWild: { playerId: PlayerId; value: "Wild" | "Wild4" } | null;
      pendingMiniGame: PublicPendingMiniGame;
      miniGameResult: MiniGameResult | null;
      winnerId: PlayerId | null;
      discardTop: DeckCard;
      history: (
        | { id: number; type: "card"; card: DeckCard; playerId: PlayerId }
        | { id: number; type: "event"; text: string }
      )[];
    }
);

type PublicPendingMiniGame =
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

type ClientInfo = {
  id: PlayerId;
  name: string;
  nameSet: boolean;
  ws: WebSocket;
  roomId: string | null;
  queueSize: 2 | 3 | 4 | null;
  sessionToken: string;
};

type SessionInfo = {
  playerId: PlayerId;
  name: string;
  nameSet: boolean;
  roomId: string | null;
  queueSize: 2 | 3 | 4 | null;
};

const PORT = Number(process.env.PORT ?? 8787);
const wss = new WebSocketServer({ port: PORT });
const clients = new Map<WebSocket, ClientInfo>();
const rooms = new Map<string, Room>();
const queues: Record<2 | 3 | 4, PlayerId[]> = { 2: [], 3: [], 4: [] };
const roomCodes = new Map<string, string>();
const unoTimers = new Map<string, NodeJS.Timeout>();
const sessions = new Map<string, SessionInfo>();
const disconnectTimers = new Map<PlayerId, NodeJS.Timeout>();
const disconnectDeadlines = new Map<PlayerId, number>();
const miniGameResultTimers = new Map<string, NodeJS.Timeout>();
const UNO_WINDOW_MS = 5000;
const RECONNECT_GRACE_MS = 45_000;

function send(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function playerName(room: Room, id: PlayerId) {
  return room.players.find((p) => p.id === id)?.name ?? "Player";
}

function timerKey(roomId: string, playerId: PlayerId) {
  return `${roomId}:${playerId}`;
}

function clearUnoTimer(roomId: string, playerId: PlayerId) {
  const key = timerKey(roomId, playerId);
  const timer = unoTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    unoTimers.delete(key);
  }
}

function clearDisconnectTimer(playerId: PlayerId) {
  const timer = disconnectTimers.get(playerId);
  if (timer) clearTimeout(timer);
  disconnectTimers.delete(playerId);
  disconnectDeadlines.delete(playerId);
}

function syncSession(client: ClientInfo) {
  sessions.set(client.sessionToken, {
    playerId: client.id,
    name: client.name,
    nameSet: client.nameSet,
    roomId: client.roomId,
    queueSize: client.queueSize,
  });
}

function scheduleUnoTimer(room: Room, playerId: PlayerId) {
  const key = timerKey(room.id, playerId);
  if (unoTimers.has(key)) return;
  const timer = setTimeout(() => {
    const liveRoom = rooms.get(room.id);
    if (!liveRoom) return;
    const window = liveRoom.state.unoWindow[playerId];
    if (!window || !window.open) return;
    if (liveRoom.state.unoCalled[playerId]) return;
    const hand = liveRoom.state.hands[playerId] ?? [];
    if (hand.length !== 1) return;
    liveRoom.state = drawCards(liveRoom.state, playerId, 2);
    liveRoom.state = {
      ...liveRoom.state,
      unoCalled: { ...liveRoom.state.unoCalled, [playerId]: true },
      unoWindow: {
        ...liveRoom.state.unoWindow,
        [playerId]: { ...liveRoom.state.unoWindow[playerId], open: false },
      },
    };
    liveRoom.state = addHistoryEvent(
      liveRoom.state,
      `${playerName(liveRoom, playerId)} failed to call UNO and drew 2.`,
    );
    pushRoomState(liveRoom);
    clearUnoTimer(liveRoom.id, playerId);
  }, UNO_WINDOW_MS);
  unoTimers.set(key, timer);
}

function syncUnoTimers(room: Room) {
  for (const player of room.players) {
    const open = room.state.unoWindow[player.id]?.open ?? false;
    const called = room.state.unoCalled[player.id] ?? true;
    if (open && !called) {
      scheduleUnoTimer(room, player.id);
    } else {
      clearUnoTimer(room.id, player.id);
    }
  }
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
  if (room.status === "lobby") {
    return {
      roomId: room.id,
      roomCode: room.code,
      roomSize: room.size,
      isPrivate: room.isPrivate,
      status: room.status,
      rematchVotes: [...room.rematchVotes],
      chat: room.chat.slice(-50),
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        handCount: room.state.hands[player.id]?.length ?? 0,
        unoWindow: room.state.unoWindow[player.id]?.open ?? false,
        unoCalled: room.state.unoCalled[player.id] ?? true,
        disconnected: !player.connected,
        reconnectDeadline: disconnectDeadlines.get(player.id) ?? null,
      })),
    };
  }

  const top = room.state.discardPile[room.state.discardPile.length - 1];
  const pending = room.state.pendingMiniGame;
  const pendingMiniGame: PublicPendingMiniGame =
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
    roomCode: room.code,
    roomSize: room.size,
    isPrivate: room.isPrivate,
    status: room.status,
    rematchVotes: [...room.rematchVotes],
    chat: room.chat.slice(-50),
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      handCount: room.state.hands[player.id]?.length ?? 0,
      unoWindow: room.state.unoWindow[player.id]?.open ?? false,
      unoCalled: room.state.unoCalled[player.id] ?? true,
      disconnected: !player.connected,
      reconnectDeadline: disconnectDeadlines.get(player.id) ?? null,
    })),
    currentPlayerId: currentPlayerId(room),
    direction: room.state.direction,
    pendingDraw2: room.state.pendingDraw2,
    pendingWild: room.state.pendingWild,
    pendingMiniGame,
    miniGameResult: room.state.miniGameResult,
    winnerId: room.state.winnerId,
    discardTop: top.card,
    history: room.state.history.slice(-25),
  };
}

function pushRoomState(room: Room) {
  syncUnoTimers(room);
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
  const resultTimer = miniGameResultTimers.get(room.id);
  if (resultTimer) clearTimeout(resultTimer);
  miniGameResultTimers.delete(room.id);
  if (room.code) {
    roomCodes.delete(room.code);
  }
  for (const player of room.players) {
    clearUnoTimer(room.id, player.id);
    clearDisconnectTimer(player.id);
  }
  for (const player of room.players) {
    const client = [...clients.values()].find((c) => c.id === player.id);
    if (client) {
      client.roomId = null;
      syncSession(client);
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
  room.rematchVotes.clear();
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
      disconnectedAt: null,
      hand: [],
    };
  });
  const room: Room = {
    id: roomId,
    code: null,
    isPrivate: false,
    size,
    players: roomPlayers,
    rematchVotes: new Set<PlayerId>(),
    chat: [],
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
      miniGameResult: null,
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
      syncSession(client);
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

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function createPrivateRoom(size: 2 | 3 | 4, host: ClientInfo) {
  let code = generateRoomCode();
  while (roomCodes.has(code)) {
    code = generateRoomCode();
  }
  const roomId = randomUUID();
  const room: Room = {
    id: roomId,
    code,
    isPrivate: true,
    size,
    players: [
      { id: host.id, name: host.name, connected: true, disconnectedAt: null, hand: [] },
    ],
    rematchVotes: new Set<PlayerId>(),
    chat: [],
    state: {
      deck: [],
      discardPile: [],
      hands: { [host.id]: [] },
      history: [],
      historyCounter: 0,
      currentPlayerIndex: 0,
      direction: 1,
      pendingWild: null,
      pendingDraw2: 0,
      pendingMiniGame: null,
      miniGameResult: null,
      winnerId: null,
      unoCalled: { [host.id]: true },
      unoWindow: { [host.id]: { open: false, token: 0 } },
    },
    status: "lobby",
  };
  rooms.set(roomId, room);
  roomCodes.set(code, roomId);
  host.roomId = roomId;
  host.queueSize = null;
  syncSession(host);
  send(host.ws, {
    type: "room_joined",
    roomId,
    youId: host.id,
    state: buildPublicState(room),
    hand: [],
  });
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
  const existing = miniGameResultTimers.get(room.id);
  if (existing) clearTimeout(existing);
  const delay = Math.max(0, (room.state.miniGameResult?.revealUntil ?? Date.now()) - Date.now());
  const timer = setTimeout(() => {
    miniGameResultTimers.delete(room.id);
    const liveRoom = rooms.get(room.id);
    if (!liveRoom) return;
    liveRoom.state = { ...liveRoom.state, miniGameResult: null };
    pushRoomState(liveRoom);
  }, delay);
  miniGameResultTimers.set(room.id, timer);
}

wss.on("connection", (ws: WebSocket) => {
  const id = randomUUID();
  const client: ClientInfo = {
    id,
    name: "Guest",
    nameSet: false,
    ws,
    roomId: null,
    queueSize: null,
    sessionToken: randomUUID(),
  };
  clients.set(ws, client);

  ws.on("message", (data: WebSocket.RawData) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(data.toString());
    } catch {
      send(ws, { type: "error", message: "Invalid message." });
      return;
    }

    if (message.type === "hello") {
      const requestedToken = message.sessionToken.trim().slice(0, 128);
      const previous = requestedToken ? sessions.get(requestedToken) : undefined;
      let resumed = false;

      if (previous) {
        const oldConnection = [...clients.values()].find(
          (candidate) => candidate !== client && candidate.id === previous.playerId,
        );
        if (oldConnection) oldConnection.ws.close(4001, "Session resumed elsewhere");
        client.id = previous.playerId;
        client.name = previous.name;
        client.nameSet = previous.nameSet;
        client.roomId = previous.roomId;
        client.queueSize = previous.queueSize;
        client.sessionToken = requestedToken;
        resumed = true;
      } else {
        client.sessionToken = requestedToken || randomUUID();
      }

      if (message.name?.trim()) {
        client.name = message.name.trim().slice(0, 24);
        client.nameSet = true;
      }
      syncSession(client);
      send(ws, {
        type: "connected",
        id: client.id,
        name: client.name,
        sessionToken: client.sessionToken,
        resumed,
      });

      if (client.roomId) {
        const room = rooms.get(client.roomId);
        const player = room?.players.find((entry) => entry.id === client.id);
        if (room && player) {
          clearDisconnectTimer(client.id);
          player.connected = true;
          player.disconnectedAt = null;
          player.name = client.name;
          room.state = addHistoryEvent(room.state, `${client.name} reconnected.`);
          send(ws, {
            type: "room_joined",
            roomId: room.id,
            youId: client.id,
            state: buildPublicState(room),
            hand: room.state.hands[client.id] ?? [],
          });
          pushRoomState(room);
        } else {
          client.roomId = null;
          syncSession(client);
        }
      }
      broadcastLobbyState();
      return;
    }

    if (message.type === "set_name") {
      const trimmed = message.name.trim();
      if (!trimmed) {
        send(ws, { type: "error", message: "Name is required." });
        return;
      }
      client.name = trimmed.slice(0, 24);
      client.nameSet = true;
      syncSession(client);
      send(ws, { type: "connected", id: client.id, name: client.name, sessionToken: client.sessionToken, resumed: false });
      return;
    }

    if (message.type === "join_lobby") {
      if (!client.nameSet) {
        send(ws, { type: "error", message: "Name is required." });
        return;
      }
      removeFromQueues(client.id);
      if (client.roomId) return;
      const size = message.desiredPlayers;
      queues[size].push(client.id);
      client.queueSize = size;
      syncSession(client);
      send(ws, { type: "queue_joined", size, waiting: queues[size].length });
      tryCreateRoom(size);
      broadcastLobbyState();
      return;
    }

    if (message.type === "create_private") {
      if (!client.nameSet) {
        send(ws, { type: "error", message: "Name is required." });
        return;
      }
      removeFromQueues(client.id);
      if (client.roomId) return;
      createPrivateRoom(message.desiredPlayers, client);
      broadcastLobbyState();
      return;
    }

    if (message.type === "join_private") {
      if (!client.nameSet) {
        send(ws, { type: "error", message: "Name is required." });
        return;
      }
      removeFromQueues(client.id);
      const code = message.code.trim().toUpperCase();
      const roomId = roomCodes.get(code);
      if (!roomId) {
        send(ws, { type: "error", message: "Room code not found." });
        return;
      }
      const room = rooms.get(roomId);
      if (!room) {
        send(ws, { type: "error", message: "Room not found." });
        return;
      }
      if (!room.isPrivate) {
        send(ws, { type: "error", message: "Room is not private." });
        return;
      }
      if (room.players.length >= room.size) {
        send(ws, { type: "error", message: "Room is full." });
        return;
      }
      room.players.push({
        id: client.id,
        name: client.name,
        connected: true,
        disconnectedAt: null,
        hand: [],
      });
      room.state.hands[client.id] = [];
      room.state.unoCalled[client.id] = true;
      room.state.unoWindow[client.id] = { open: false, token: 0 };
      client.roomId = room.id;
      client.queueSize = null;
      syncSession(client);
      send(ws, {
        type: "room_joined",
        roomId: room.id,
        youId: client.id,
        state: buildPublicState(room),
        hand: [],
      });
      if (room.players.length === room.size) {
        startRoom(room);
      } else {
        pushRoomState(room);
      }
      return;
    }

    if (message.type === "leave_lobby") {
      removeFromQueues(client.id);
      client.queueSize = null;
      syncSession(client);
      broadcastLobbyState();
      return;
    }

    if (message.type === "leave_room") {
      withRoom(client, (room) => {
        room.rematchVotes.delete(client.id);
        clearUnoTimer(room.id, client.id);
        room.players = room.players.filter((p) => p.id !== client.id);
        delete room.state.hands[client.id];
        delete room.state.unoCalled[client.id];
        delete room.state.unoWindow[client.id];
        if (room.players.length < 2) {
          if (room.code) {
            roomCodes.delete(room.code);
          }
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
      syncSession(client);
      broadcastLobbyState();
      return;
    }

    if (message.type === "play_again") {
      withRoom(client, (room) => {
        if (room.status !== "finished") return;
        room.rematchVotes.add(client.id);
        if (room.rematchVotes.size === room.players.length) {
          startRoom(room);
          return;
        }
        pushRoomState(room);
      });
      return;
    }

    if (message.type === "chat") {
      withRoom(client, (room) => {
        const text = message.text.trim();
        if (!text) return;
        const trimmed = text.slice(0, 200);
        const nextId = room.chat.length > 0 ? room.chat[room.chat.length - 1].id + 1 : 1;
        room.chat.push({
          id: nextId,
          playerId: client.id,
          name: client.name,
          text: trimmed,
          timestamp: Date.now(),
        });
        if (room.chat.length > 200) {
          room.chat = room.chat.slice(-200);
        }
        pushRoomState(room);
      });
      return;
    }

    if (message.type === "action") {
      withRoom(client, (room) => {
        if (room.status !== "playing") return;
        if (room.state.winnerId) {
          send(ws, { type: "error", message: "Game is finished." });
          return;
        }
        if (room.state.miniGameResult) {
          send(ws, { type: "error", message: "Wait for the minigame reveal to finish." });
          return;
        }
        const playerId = client.id;
        const isTurn = currentPlayerId(room) === playerId;

        if (message.action.type === "draw") {
          if (!isTurn) return;
          if (room.state.pendingWild || room.state.pendingMiniGame) return;
          if (room.state.pendingDraw2 === 0) {
            const hand = room.state.hands[playerId] ?? [];
            const top = room.state.discardPile[room.state.discardPile.length - 1]?.card;
            if (top && hand.some((card) => isPlayableForTurn(card, top, 0))) {
              send(ws, { type: "error", message: "Play a matching card before drawing." });
              return;
            }
          }
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
          const action = message.action;
          if (!isTurn) return;
          if (room.state.pendingWild || room.state.pendingMiniGame) return;
          const hand = room.state.hands[playerId] ?? [];
          const card = hand[action.index];
          if (!card) return;
          if (!canPlayFinalCard(hand.length, room.state.unoCalled[playerId])) {
            send(ws, {
              type: "error",
              message: "Call UNO before playing your last card.",
            });
            return;
          }
          const top = room.state.discardPile[room.state.discardPile.length - 1].card;
          if (!isPlayableForTurn(card, top, room.state.pendingDraw2)) return;
          if (room.state.pendingDraw2 > 0 && card.value !== "Draw2") return;

          const nextHand = hand.filter((_, i) => i !== action.index);
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
              room.status = "finished";
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
            room.status = "finished";
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
            room.status = "finished";
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
          clearUnoTimer(room.id, playerId);
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
          clearUnoTimer(room.id, targetId);
          room.state = updateUnoWindows(room, room.state);
          pushRoomState(room);
          return;
        }
      });
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    const replacement = [...clients.values()].find(
      (candidate) => candidate.id === client.id,
    );
    if (replacement) return;

    removeFromQueues(client.id);
    client.queueSize = null;
    syncSession(client);
    if (client.roomId) {
      const room = rooms.get(client.roomId);
      if (room) {
        clearUnoTimer(room.id, client.id);
        const player = room.players.find((p) => p.id === client.id);
        if (player) {
          player.connected = false;
          player.disconnectedAt = Date.now();
        }
        const deadline = Date.now() + RECONNECT_GRACE_MS;
        disconnectDeadlines.set(client.id, deadline);
        room.state = addHistoryEvent(
          room.state,
          `${client.name} lost connection. Holding their seat for 45 seconds.`,
        );
        clearDisconnectTimer(client.id);
        disconnectDeadlines.set(client.id, deadline);
        const timer = setTimeout(() => {
          disconnectTimers.delete(client.id);
          disconnectDeadlines.delete(client.id);
          const liveRoom = rooms.get(room.id);
          const livePlayer = liveRoom?.players.find((entry) => entry.id === client.id);
          if (!liveRoom || !livePlayer || livePlayer.connected) return;

          if (liveRoom.status === "lobby") {
            liveRoom.players = liveRoom.players.filter((entry) => entry.id !== client.id);
            if (liveRoom.players.length === 0) {
              closeRoom(liveRoom, "Room closed.");
              return;
            }
          } else if (liveRoom.status === "playing") {
            const pending = liveRoom.state.pendingMiniGame;
            if (pending && (pending.throwerId === client.id || pending.targetId === client.id)) {
              liveRoom.state.pendingMiniGame = null;
            }
            if (currentPlayerId(liveRoom) === client.id) {
              liveRoom.state.currentPlayerIndex = advanceIndex(
                liveRoom,
                liveRoom.state.currentPlayerIndex,
                1,
              );
            }
            liveRoom.state = addHistoryEvent(
              liveRoom.state,
              `${client.name} did not reconnect. Their turn was skipped.`,
            );
          }
          pushRoomState(liveRoom);
        }, RECONNECT_GRACE_MS);
        disconnectTimers.set(client.id, timer);
        pushRoomState(room);
      }
    }
    broadcastLobbyState();
  });
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);
