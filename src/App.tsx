import { useState } from "react";
import Game from "./pages/Game";
import Menu from "./pages/Menu";
import Online from "./pages/Online";
import Rules from "./pages/Rules";

type Screen = "menu" | "rules_ai" | "rules_people" | "ai" | "online";

function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [gameSession, setGameSession] = useState(0);

  if (screen === "menu") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100">
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
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100">
        <Rules
          mode="ai"
          onBack={() => setScreen("menu")}
          onStartAI={() => {
            setGameSession((prev) => prev + 1);
            setScreen("ai");
          }}
        />
      </div>
    );
  }

  if (screen === "rules_people") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100">
        <Rules mode="people" onBack={() => setScreen("menu")} />
      </div>
    );
  }

  if (screen === "online") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100">
        <Online onBack={() => setScreen("menu")} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100">
      <Game
        key={gameSession}
        onBack={() => setScreen("menu")}
      />
    </div>
  );
}

export default App;
