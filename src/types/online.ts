import type { deckOutline } from "./cards";

export type PlayerId = string;

export type LobbyQueue = { size: 2 | 3 | 4; waiting: number };

export type PublicPlayer = {
  id: PlayerId;
  name: string;
  handCount: number;
  unoWindow: boolean;
  unoCalled: boolean;
  disconnected: boolean;
  reconnectDeadline: number | null;
};

export type PublicPendingMiniGame =
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

export type PublicMiniGameResult =
  | { type: "rps"; throwerId: PlayerId; targetId: PlayerId; throwerChoice: "rock" | "paper" | "scissors"; targetChoice: "rock" | "paper" | "scissors"; winnerId: PlayerId | null; loserId: PlayerId | null; penalty: number; revealUntil: number }
  | { type: "coin"; throwerId: PlayerId; targetId: PlayerId; choice: "heads" | "tails"; landed: "heads" | "tails"; winnerId: PlayerId; loserId: PlayerId; penalty: number; revealUntil: number };

export type PublicState = {
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
  players: PublicPlayer[];
} & (
  | {
      status: "lobby";
    }
  | {
      status: "playing" | "finished";
      currentPlayerId: PlayerId;
      direction: 1 | -1;
      pendingDraw2: number;
      pendingWild: { playerId: PlayerId; value: "Wild" | "Wild4" } | null;
      pendingMiniGame: PublicPendingMiniGame;
      miniGameResult: PublicMiniGameResult | null;
      winnerId: PlayerId | null;
      discardTop: deckOutline;
      history: (
        | { id: number; type: "card"; card: deckOutline; playerId: PlayerId }
        | { id: number; type: "event"; text: string }
      )[];
    }
);

export type ActivePublicState = Extract<
  PublicState,
  { status: "playing" | "finished" }
>;

export type ServerMessage =
  | { type: "connected"; id: PlayerId; name: string; sessionToken: string; resumed: boolean }
  | { type: "lobby_state"; queues: LobbyQueue[] }
  | { type: "queue_joined"; size: 2 | 3 | 4; waiting: number }
  | {
      type: "room_joined";
      roomId: string;
      youId: PlayerId;
      state: PublicState;
      hand: deckOutline[];
    }
  | { type: "state"; state: PublicState; hand: deckOutline[] }
  | { type: "room_closed"; reason: string }
  | { type: "error"; message: string };

export type ClientMessage =
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
        | { type: "rps_choice"; choice: "rock" | "paper" | "scissors" }
        | { type: "coin_choice"; choice: "heads" | "tails" }
        | { type: "call_uno_self" }
        | { type: "call_uno_on"; targetId: PlayerId };
    };
