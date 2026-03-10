import { useEffect, useState } from "react";
import Card from "./components/Card";
import { generateDeck } from "./utilities/deckEngine";
import type { deckOutline } from "./utilities/constants";

type Player = "player" | "ai";

interface GameState {
  deck: deckOutline[];
  playerHand: deckOutline[];
  aiHand: deckOutline[];
  discard: deckOutline;
  currentPlayer: Player;
  winner: Player | null;
}

function initGame(): GameState {
  const deck = generateDeck();
  const playerHand = deck.slice(0, 7);
  const aiHand = deck.slice(7, 14);
  const discard = deck[14];
  const remainingDeck = deck.slice(15);

  return {
    deck: remainingDeck,
    playerHand,
    aiHand,
    discard,
    currentPlayer: "player",
    winner: null,
  };
}

function isPlayable(card: deckOutline, top: deckOutline): boolean {
  return card.color === top.color || card.value === top.value;
}

function App() {
  const [game, setGame] = useState<GameState>(() => initGame());

  const { deck, playerHand, aiHand, discard, currentPlayer, winner } = game;

  function resetGame() {
    setGame(initGame());
  }

  function drawCard(player: Player) {
    setGame((prev) => {
      if (prev.deck.length === 0 || prev.winner) return prev;
      const [drawn, ...rest] = prev.deck;
      if (player === "player") {
        return { ...prev, deck: rest, playerHand: [...prev.playerHand, drawn] };
      }
      return { ...prev, deck: rest, aiHand: [...prev.aiHand, drawn] };
    });
  }

  function playCard(player: Player, index: number) {
    setGame((prev) => {
      if (prev.winner || prev.currentPlayer !== player) return prev;
      const hand = player === "player" ? prev.playerHand : prev.aiHand;
      const card = hand[index];
      if (!card || !isPlayable(card, prev.discard)) return prev;

      const nextHand = hand.filter((_, i) => i !== index);
      const nextState: GameState = {
        ...prev,
        discard: card,
        playerHand: player === "player" ? nextHand : prev.playerHand,
        aiHand: player === "ai" ? nextHand : prev.aiHand,
        currentPlayer: player === "player" ? "ai" : "player",
      };

      if (nextHand.length === 0) {
        nextState.winner = player;
      }

      return nextState;
    });
  }

  useEffect(() => {
    if (winner || currentPlayer !== "ai") return;
    const timer = setTimeout(() => {
      setGame((prev) => {
        if (prev.winner || prev.currentPlayer !== "ai") return prev;
        const playableIndex = prev.aiHand.findIndex((card) =>
          isPlayable(card, prev.discard),
        );

        if (playableIndex === -1) {
          if (prev.deck.length === 0) {
            return { ...prev, currentPlayer: "player" };
          }
          const [drawn, ...rest] = prev.deck;
          const updatedHand = [...prev.aiHand, drawn];
          const drawnIndex = updatedHand.length - 1;
          const canPlayDrawn = isPlayable(drawn, prev.discard);

          return canPlayDrawn
            ? {
                ...prev,
                deck: rest,
                aiHand: updatedHand.filter((_, i) => i !== drawnIndex),
                discard: drawn,
                currentPlayer: "player",
              }
            : {
                ...prev,
                deck: rest,
                aiHand: updatedHand,
                currentPlayer: "player",
              };
        }

        const card = prev.aiHand[playableIndex];
        const nextHand = prev.aiHand.filter((_, i) => i !== playableIndex);
        return {
          ...prev,
          aiHand: nextHand,
          discard: card,
          currentPlayer: "player",
          winner: nextHand.length === 0 ? "ai" : prev.winner,
        };
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [currentPlayer, winner]);

  return (
    <>
      <div>Top card: {discard.color}, {discard.value}</div>
      <div>Deck: {deck.length} cards</div>
      <div>AI hand: {aiHand.length} cards</div>
      <div>Current turn: {currentPlayer}</div>
      {winner && <div>Winner: {winner}</div>}

      <div>
        <button onClick={resetGame}>Restart</button>
        <button
          onClick={() => drawCard("player")}
          disabled={currentPlayer !== "player" || !!winner}
        >
          Draw
        </button>
      </div>

      <div>
        {playerHand.map((val, index) => (
          <button
            key={`${val.color}-${val.value}-${index}`}
            onClick={() => playCard("player", index)}
            disabled={
              currentPlayer !== "player" ||
              !!winner ||
              !isPlayable(val, discard)
            }
          >
            <Card color={val.color} value={val.value} />
          </button>
        ))}
      </div>
    </>
  );
}

export default App;
