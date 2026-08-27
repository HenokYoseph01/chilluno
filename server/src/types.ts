export type PlayerId = string;

export type Color = "red" | "yellow" | "green" | "blue" | "wild";
export type NonWildColor = Exclude<Color, "wild">;
export type CardValue =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | "Skip"
  | "Reverse"
  | "Draw2"
  | "Wild"
  | "Wild4"
  | "RPS"
  | "HT";

export interface DeckCard {
  color: Color;
  value: CardValue;
}

export type RpsChoice = "rock" | "paper" | "scissors";
export type CoinChoice = "heads" | "tails";

export interface HistoryCardEntry {
  id: number;
  type: "card";
  card: DeckCard;
  playerId: PlayerId;
}

export interface HistoryEventEntry {
  id: number;
  type: "event";
  text: string;
}

export type HistoryEntry = HistoryCardEntry | HistoryEventEntry;

export interface PendingWild {
  playerId: PlayerId;
  value: "Wild" | "Wild4";
}

export interface PendingRps {
  type: "rps";
  throwerId: PlayerId;
  targetId: PlayerId;
  chosenColor: NonWildColor | null;
  throwerChoice: RpsChoice | null;
  targetChoice: RpsChoice | null;
}

export interface PendingCoin {
  type: "coin";
  throwerId: PlayerId;
  targetId: PlayerId;
  chosenColor: NonWildColor | null;
  throwerChoice: CoinChoice | null;
}

export type PendingMiniGame = PendingRps | PendingCoin;

export type MiniGameResult =
  | { type: "rps"; throwerId: PlayerId; targetId: PlayerId; throwerChoice: RpsChoice; targetChoice: RpsChoice; winnerId: PlayerId | null; loserId: PlayerId | null; penalty: number; revealUntil: number }
  | { type: "coin"; throwerId: PlayerId; targetId: PlayerId; choice: CoinChoice; landed: CoinChoice; winnerId: PlayerId; loserId: PlayerId; penalty: number; revealUntil: number };

export interface UnoWindowState {
  open: boolean;
  token: number;
}

export interface GameState {
  deck: DeckCard[];
  discardPile: { card: DeckCard; playerId: PlayerId }[];
  hands: Record<PlayerId, DeckCard[]>;
  history: HistoryEntry[];
  historyCounter: number;
  currentPlayerIndex: number;
  direction: 1 | -1;
  pendingWild: PendingWild | null;
  pendingDraw2: number;
  pendingMiniGame: PendingMiniGame | null;
  miniGameResult: MiniGameResult | null;
  winnerId: PlayerId | null;
  unoCalled: Record<PlayerId, boolean>;
  unoWindow: Record<PlayerId, UnoWindowState>;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  connected: boolean;
  disconnectedAt: number | null;
  hand: DeckCard[];
}

export interface Room {
  id: string;
  code: string | null;
  isPrivate: boolean;
  size: number;
  players: PlayerState[];
  state: GameState;
  status: "lobby" | "playing" | "finished";
  rematchVotes: Set<PlayerId>;
  chat: ChatMessage[];
  hostId: PlayerId | null;
  readyPlayers: Set<PlayerId>;
}

export interface ChatMessage {
  id: number;
  playerId: PlayerId;
  name: string;
  text: string;
  timestamp: number;
}
