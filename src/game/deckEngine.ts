import type { CardValue, Color, deckOutline } from "../types/cards";

export const generateDeck = (): deckOutline[] => {
  const color: Color[] = ["blue", "green", "red", "yellow"];
  const normalValue: CardValue[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const actionValue: CardValue[] = ["Skip", "Reverse", "Draw2"];
  const deck: deckOutline[] = [];

  for (const c of color) {
    deck.push({ color: c, value: 0 });
    for (const n of normalValue.slice(1)) {
      deck.push({ color: c, value: n });
      deck.push({ color: c, value: n });
    }

    for (const a of actionValue) {
      deck.push({ color: c, value: a });
      deck.push({ color: c, value: a });
    }
  }

  for (let i = 0; i < 4; i += 1) {
    deck.push({ color: "wild", value: "Wild" });
    deck.push({ color: "wild", value: "Wild4" });
  }

  return shuffleArray(deck);
};

export function shuffleArray<T>(array: T[]): T[] {
  let currentIndex = array.length,
    randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex !== 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}
