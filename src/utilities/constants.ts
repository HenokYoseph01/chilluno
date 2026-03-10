export type Color = "red" | "yellow" | "green" | "blue" | "wild";
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
  | "Wild4";

export interface deckOutline {
  color: Color;
  value: CardValue;
}
