import { useEffect, useState } from "react";
import Card from "./components/Card";
import { generateDeck } from "./utilities/deckEngine";
import type { deckOutline } from "./utilities/constants";

function App() {
  const [deck, setDeck] = useState<deckOutline[]>(generateDeck());
  const [playerHand, setPlayerHand] = useState<deckOutline[]>([]);
  const [aiHand, setAiHand] = useState<deckOutline[]>([]);

  function setPlayerInitalHand() {
    const initialHand = deck.slice(0, 7);
    const remainingDeck = deck.slice(7);
    setPlayerHand(initialHand);
    setDeck(remainingDeck);
  }

  useEffect(() => {
    setPlayerInitalHand();
  }, []);

  return (
    <>
      {playerHand.map((val, index) => (
        <Card color={val.color} value={val.value} key={index} />
      ))}
    </>
  );
}

export default App;
