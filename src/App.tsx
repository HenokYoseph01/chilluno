import { useState } from "react";
import Game from "./pages/Game";
import Menu from "./pages/Menu";
import Online from "./pages/Online";
import Rules from "./pages/Rules";

type Screen = "menu" | "rules_ai" | "rules_people" | "ai" | "online";
type AiDifficulty = "beginner" | "intermediate" | "insane";

function App() {
  const [screen, setScreen] = useState<Screen>(() => /^\/room\/[A-Za-z0-9]+\/?$/.test(window.location.pathname) ? "online" : "menu");
  const [gameSession, setGameSession] = useState(0);
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>("intermediate");
  const goHome = () => {
    if (window.location.pathname !== "/") window.history.replaceState({}, "", "/");
    setScreen("menu");
  };

  if (screen === "menu") {
    return (
      <div className="app-shell text-slate-100">
        <Menu
          onSelectAI={() => setScreen("rules_ai")}
          onSelectOnline={() => setScreen("online")}
          onSelectPeopleRules={() => setScreen("rules_people")}
        />
      </div>
    );
  }

  if (screen === "rules_ai") {
    return (
      <div className="app-shell text-slate-100">
        <Rules
          mode="ai"
          onBack={() => setScreen("menu")}
          onStartAI={(difficulty) => {
            setAiDifficulty(difficulty);
            setGameSession((prev) => prev + 1);
            setScreen("ai");
          }}
        />
      </div>
    );
  }

  if (screen === "rules_people") {
    return (
      <div className="app-shell text-slate-100">
        <Rules mode="people" onBack={() => setScreen("menu")} />
      </div>
    );
  }

  if (screen === "online") {
    return (
      <div className="app-shell text-slate-100">
        <Online onBack={goHome} />
      </div>
    );
  }

  return (
    <div className="app-shell text-slate-100">
      <Game
        key={gameSession}
        onBack={() => setScreen("menu")}
        difficulty={aiDifficulty}
      />
    </div>
  );
}

export default App;
