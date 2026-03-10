import type { CardValue, Color, deckOutline } from "./constants";

export const generateDeck = (): deckOutline[] => {
  const color: Color[] = ["blue", "green", "red", "yellow"];
  const normalValue: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const deck: deckOutline[] = [];

  for (const c in color) {
    for (const n in normalValue) {
      deck.push({
        color: color[c] as Color,
        value: normalValue[n] as CardValue,
      });
    }
  }

  return shuffleArray(deck);
};

function shuffleArray<T>(array: T[]): T[] {
  let currentIndex = array.length,
    randomIndex;
  console.log(array.length);

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
