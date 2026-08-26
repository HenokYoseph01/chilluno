import { useEffect, useMemo, useRef, useState } from "react";
import OnlineGame from "./OnlineGame";
import type { ClientMessage, LobbyQueue, PublicState, ServerMessage } from "../types/online";
import type { deckOutline } from "../types/cards";

const DEFAULT_WS_URL = "ws://localhost:8787";

export default function Online({ onBack }: { onBack: () => void }) {
  const [connected, setConnected] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [clientId, setClientId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [queueSize, setQueueSize] = useState<2 | 3 | 4 | null>(null);
  const [desiredPlayers, setDesiredPlayers] = useState<2 | 3 | 4>(2);
  const [queues, setQueues] = useState<LobbyQueue[]>([]);
  const [roomState, setRoomState] = useState<PublicState | null>(null);
  const [hand, setHand] = useState<deckOutline[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [privateCode, setPrivateCode] = useState("");
  const [lobbyTab, setLobbyTab] = useState<"public" | "private">("public");
  const nameReady = name.trim().length > 0;
  const wsUrl = useMemo(
    () => import.meta.env.VITE_WS_URL ?? DEFAULT_WS_URL,
    [],
  );
  const socketRef = useRef<WebSocket | null>(null);
  const nameRef = useRef(name);
  const didUnmountRef = useRef(false);
  const sessionTokenRef = useRef(
    window.localStorage.getItem("chillno-session") ?? window.crypto.randomUUID(),
  );

  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  useEffect(() => {
    didUnmountRef.current = false;
    let retryTimer: number | null = null;
    let attempts = 0;

    const connect = () => {
      if (didUnmountRef.current) return;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        attempts = 0;
        setReconnectAttempt(0);
        setConnected(true);
        setError(null);
        ws.send(JSON.stringify({
          type: "hello",
          name: nameRef.current.trim() || undefined,
          sessionToken: sessionTokenRef.current,
        }));
      };
      ws.onclose = () => {
        if (didUnmountRef.current) return;
        setConnected(false);
        socketRef.current = null;
        attempts += 1;
        setReconnectAttempt(attempts);
        const delay = Math.min(1000 * 2 ** (attempts - 1), 10_000);
        retryTimer = window.setTimeout(connect, delay);
      };
      ws.onerror = () => {
        if (didUnmountRef.current) return;
        setError("Connection interrupted. Trying to rejoin…");
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
        sessionTokenRef.current = message.sessionToken;
        window.localStorage.setItem("chillno-session", message.sessionToken);
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
        setError(message.reason);
      }
      if (message.type === "error") {
        setError(message.message);
      }
      };
    };

    connect();

    return () => {
      didUnmountRef.current = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      const liveSocket = socketRef.current;
      socketRef.current = null;
      if (liveSocket) liveSocket.close();
    };
  }, [wsUrl]);

  function send(message: ClientMessage) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }

  function handleJoinLobby() {
    if (!connected) return;
    if (!nameReady) {
      setError("Please enter a name to play.");
      return;
    }
    send({ type: "set_name", name });
    send({ type: "join_lobby", desiredPlayers });
  }

  function handleLeaveLobby() {
    send({ type: "leave_lobby" });
    setQueueSize(null);
  }

  function handleCreatePrivate() {
    if (!connected) return;
    if (!nameReady) {
      setError("Please enter a name to play.");
      return;
    }
    send({ type: "set_name", name });
    send({ type: "create_private", desiredPlayers });
  }

  function handleJoinPrivate() {
    if (!connected) return;
    if (!privateCode.trim()) return;
    if (!nameReady) {
      setError("Please enter a name to play.");
      return;
    }
    send({ type: "set_name", name });
    send({ type: "join_private", code: privateCode.trim() });
  }

  if (roomState && clientId && roomState.status !== "lobby") {
    return (
      <>
        <OnlineGame state={roomState} hand={hand} youId={clientId} send={send} onLeave={() => { send({ type: "leave_room" }); setRoomState(null); }} />
        {!connected && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#080711]/80 px-4 backdrop-blur-md"><div className="glass-panel w-full max-w-sm rounded-3xl p-7 text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[#b8f36b]"/><div className="display-font mt-5 text-xl font-bold">Rejoining your table…</div><p className="mt-2 text-sm text-slate-400">Your cards and seat are being held. Attempt {reconnectAttempt || 1}.</p></div></div>}
      </>
    );
  }

  if (roomState && clientId && roomState.status === "lobby") {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-10">
        <div>
        <div className="eyebrow">
          Your private table
        </div>
        <div className="display-font text-4xl font-bold">Bring the chaos.</div>
        <div className="text-xs text-slate-500">
          Waiting for players...
        </div>
        </div>
        <div className="glass-panel rounded-3xl p-6 text-sm text-slate-200">
          <div className="text-slate-400">Room Code</div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="display-font rounded-2xl bg-black/25 px-5 py-3 text-3xl font-bold tracking-[.22em] text-[#b8f36b]">{roomState.roomCode ?? "—"}</div>
            <button className="secondary-button px-4 py-3 text-xs font-bold" onClick={async () => { const code = roomState.roomCode; if (!code) return; await navigator.clipboard.writeText(code); setError("Room code copied — send it to your crew."); }}>Copy code</button>
          </div>
          <div className="mt-3 text-xs text-slate-400">
            Players: {roomState.players.length} / {roomState.roomSize}
          </div>
          <div className="mt-4 space-y-2 text-xs text-slate-300">
            {roomState.players.map((player) => (
              <div key={player.id}>
                {player.name}
                {player.id === clientId ? " (You)" : ""}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              className="rounded-md bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
              onClick={() => {
                send({ type: "leave_room" });
                setRoomState(null);
              }}
            >
              Leave Room
            </button>
            <button
              className="rounded-md bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
              onClick={onBack}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-10">
      <div>
        <div className="eyebrow">
          Multiplayer lounge
        </div>
        <div className="display-font mt-2 text-4xl font-bold">Find your table.</div>
        <div className="text-xs text-slate-500">
          Status: {connected ? "Connected" : "Connecting..."}
        </div>
        <button
          className="mt-3 rounded-md bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
          onClick={onBack}
        >
          Back
        </button>
      </div>

      <div className="glass-panel rounded-3xl p-6 text-sm text-slate-200">
        <div className="text-slate-400">Your Name (Required)</div>
        <input
          className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
          placeholder="Pick a name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
        {!nameReady && (
          <div className="mt-2 text-xs text-amber-200">
            Please enter a name to join a room.
          </div>
        )}
        <div className="mt-4 flex items-center gap-2">
          <button
            className={`rounded-md px-3 py-2 text-sm ${
              lobbyTab === "public"
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
            onClick={() => setLobbyTab("public")}
          >
            Public Lobby
          </button>
          <button
            className={`rounded-md px-3 py-2 text-sm ${
              lobbyTab === "private"
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
            onClick={() => setLobbyTab("private")}
          >
            Private Room
          </button>
        </div>

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

        {lobbyTab === "public" ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                onClick={handleJoinLobby}
                disabled={!connected || queueSize !== null || !nameReady}
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
          </>
        ) : (
          <>
            <div className="mt-4 text-slate-400">Join With Code</div>
            <input
              className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm uppercase tracking-widest text-slate-100 focus:border-emerald-500 focus:outline-none"
              placeholder="ROOMCODE"
              value={privateCode}
              onChange={(event) => setPrivateCode(event.target.value)}
            />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                onClick={handleCreatePrivate}
                disabled={!connected || !nameReady}
              >
                Create Private Room
              </button>
              <button
                className="rounded-md bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-50"
                onClick={handleJoinPrivate}
                disabled={!connected || !privateCode.trim() || !nameReady}
              >
                Join Room
              </button>
              <button
                className="rounded-md bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
                onClick={onBack}
              >
                Back
              </button>
            </div>
          </>
        )}
        {error && (
          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {error}
          </div>
        )}
      </div>

      {lobbyTab === "public" && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-200">
          <div className="text-slate-400">Lobby Activity</div>
          <div className="mt-3 space-y-2 text-xs text-slate-300">
            {queues.map((queue) => (
              <div key={queue.size}>
                {queue.size}-player rooms: {queue.waiting} waiting
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
