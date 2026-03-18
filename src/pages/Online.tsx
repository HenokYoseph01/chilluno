import { useEffect, useMemo, useRef, useState } from "react";
import OnlineGame from "./OnlineGame";
import type { ClientMessage, LobbyQueue, PublicState, ServerMessage } from "../types/online";
import type { deckOutline } from "../types/cards";

const DEFAULT_WS_URL = "ws://localhost:8787";

export default function Online({ onBack }: { onBack: () => void }) {
  const [connected, setConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [queueSize, setQueueSize] = useState<2 | 3 | 4 | null>(null);
  const [desiredPlayers, setDesiredPlayers] = useState<2 | 3 | 4>(2);
  const [queues, setQueues] = useState<LobbyQueue[]>([]);
  const [roomState, setRoomState] = useState<PublicState | null>(null);
  const [hand, setHand] = useState<deckOutline[]>([]);
  const [error, setError] = useState<string | null>(null);
  const wsUrl = useMemo(
    () => import.meta.env.VITE_WS_URL ?? DEFAULT_WS_URL,
    [],
  );
  const socketRef = useRef<WebSocket | null>(null);
  const didOpenRef = useRef(false);
  const didUnmountRef = useRef(false);

  useEffect(() => {
    didUnmountRef.current = false;
    didOpenRef.current = false;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      didOpenRef.current = true;
      setConnected(true);
      setError(null);
      if (name.trim()) {
        ws.send(JSON.stringify({ type: "set_name", name }));
      }
    };
    ws.onclose = () => {
      if (didUnmountRef.current) return;
      setConnected(false);
      setRoomState(null);
      setQueueSize(null);
    };
    ws.onerror = () => {
      if (didUnmountRef.current) return;
      if (!didOpenRef.current) {
        // Ignore the first close in dev StrictMode double-mount.
        return;
      }
      setError("Connection error.");
    };
    ws.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "connected") {
        setClientId(message.id);
      }
      if (message.type === "lobby_state") {
        setQueues(message.queues);
      }
      if (message.type === "queue_joined") {
        setQueueSize(message.size);
      }
      if (message.type === "room_joined") {
        setRoomState(message.state);
        setHand(message.hand);
      }
      if (message.type === "state") {
        setRoomState(message.state);
        setHand(message.hand);
      }
      if (message.type === "room_closed") {
        setRoomState(null);
        setQueueSize(null);
      }
      if (message.type === "error") {
        setError(message.message);
      }
    };

    return () => {
      didUnmountRef.current = true;
      socketRef.current = null;
      ws.close();
    };
  }, [wsUrl, name]);

  function send(message: ClientMessage) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }

  function handleJoinLobby() {
    if (!connected) return;
    if (name.trim()) {
      send({ type: "set_name", name });
    } else {
      send({ type: "hello" });
    }
    send({ type: "join_lobby", desiredPlayers });
  }

  function handleLeaveLobby() {
    send({ type: "leave_lobby" });
    setQueueSize(null);
  }

  if (roomState && clientId) {
    return (
      <OnlineGame
        state={roomState}
        hand={hand}
        youId={clientId}
        send={send}
        onLeave={() => {
          send({ type: "leave_room" });
          setRoomState(null);
        }}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-10">
      <div>
        <div className="text-xs uppercase tracking-widest text-slate-400">
          UNO Clone
        </div>
        <div className="text-3xl font-semibold">Online Lobby</div>
        <div className="text-xs text-slate-500">
          Status: {connected ? "Connected" : "Connecting..."}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-200">
        <div className="text-slate-400">Your Name</div>
        <input
          className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
          placeholder="Guest"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="mt-4 text-slate-400">Preferred Room Size</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[2, 3, 4].map((size) => (
            <button
              key={size}
              className={`rounded-md px-3 py-2 text-sm ${
                desiredPlayers === size
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
              onClick={() => setDesiredPlayers(size as 2 | 3 | 4)}
            >
              {size} Players
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
            onClick={handleJoinLobby}
            disabled={!connected || queueSize !== null}
          >
            Join Lobby
          </button>
          <button
            className="rounded-md bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-50"
            onClick={handleLeaveLobby}
            disabled={queueSize === null}
          >
            Leave Queue
          </button>
          <button
            className="rounded-md bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
            onClick={onBack}
          >
            Back
          </button>
        </div>
        {queueSize !== null && (
          <div className="mt-3 text-xs text-slate-400">
            Waiting for {queueSize} player room to fill...
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {error}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-200">
        <div className="text-slate-400">Lobby Activity</div>
        <div className="mt-3 space-y-2 text-xs text-slate-300">
          {queues.map((queue) => (
            <div key={queue.size}>
              {queue.size}-player rooms: {queue.waiting} waiting
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-slate-500">
          Server URL: {wsUrl}
        </div>
      </div>
    </div>
  );
}
