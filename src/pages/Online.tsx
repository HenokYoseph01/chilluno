import { useEffect, useMemo, useRef, useState } from "react";
import OnlineGame from "./OnlineGame";
import type { ClientMessage, LobbyQueue, PublicState, ServerMessage } from "../types/online";
import type { deckOutline } from "../types/cards";

const DEFAULT_WS_URL = import.meta.env.DEV
  ? "ws://localhost:8797"
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
const MAX_RECONNECT_ATTEMPTS = 8;

function isCompatibleRoomState(state: PublicState) {
  const candidate = state as PublicState & Record<string, unknown>;
  return Array.isArray(candidate.readyPlayerIds) &&
    typeof candidate.scores === "object" && candidate.scores !== null &&
    typeof candidate.stats === "object" && candidate.stats !== null &&
    Array.isArray(candidate.reactions) &&
    typeof candidate.eventLockedUntil === "number"; 
}

export default function Online({ onBack }: { onBack: () => void }) {
  const [connected, setConnected] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [connectionCycle, setConnectionCycle] = useState(0);
  const [copyNotice, setCopyNotice] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const inviteCode = useMemo(() => window.location.pathname.match(/^\/room\/([A-Za-z0-9]+)$/)?.[1]?.toUpperCase() ?? "", []);
  const [name, setName] = useState(() => window.localStorage.getItem("chillno-name") ?? "");
  const [queueSize, setQueueSize] = useState<2 | 3 | 4 | null>(null);
  const [desiredPlayers, setDesiredPlayers] = useState<2 | 3 | 4>(2);
  const [queues, setQueues] = useState<LobbyQueue[]>([]);
  const [roomState, setRoomState] = useState<PublicState | null>(null);
  const [hand, setHand] = useState<deckOutline[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [privateCode, setPrivateCode] = useState(inviteCode);
  const [customCode, setCustomCode] = useState("");
  const [lobbyTab, setLobbyTab] = useState<"public" | "create" | "join">(inviteCode ? "join" : "public");
  const nameReady = name.trim().length > 0;
  const wsUrl = useMemo(
    () => import.meta.env.VITE_WS_URL ?? DEFAULT_WS_URL,
    [],
  );
  const socketRef = useRef<WebSocket | null>(null);
  const nameRef = useRef(name);
  const sessionTokenRef = useRef(
    window.localStorage.getItem("chillno-session") ?? window.crypto.randomUUID(),
  );

  useEffect(() => {
    nameRef.current = name;
    if (name.trim()) window.localStorage.setItem("chillno-name", name.trim());
  }, [name]);

  function inviteUrl(code: string) {
    return `${window.location.origin}/room/${code}`;
  }

  async function copyInvite(code: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(code));
      setCopyNotice(true);
      window.setTimeout(() => setCopyNotice(false), 2200);
    } catch {
      setError("Could not copy the invite. Copy the room code manually.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    let attempts = 0;

    const connect = () => {
      if (cancelled) return;
      const existing = socketRef.current;
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (cancelled || socketRef.current !== ws) return;
        setConnected(true);
        setError(null);
        ws.send(JSON.stringify({
          type: "hello",
          name: nameRef.current.trim() || undefined,
          sessionToken: sessionTokenRef.current,
        }));
      };
      ws.onclose = () => {
        if (cancelled || socketRef.current !== ws) return;
        setConnected(false);
        socketRef.current = null;
        attempts += 1;
        setReconnectAttempt(attempts);
        if (attempts >= MAX_RECONNECT_ATTEMPTS) {
          setError(`Could not reach ${wsUrl}. Check that the multiplayer server is running, then retry.`);
          return;
        }
        const delay = Math.min(1000 * 2 ** (attempts - 1), 10_000);
        retryTimer = window.setTimeout(connect, delay);
      };
      ws.onerror = () => {
        if (cancelled || socketRef.current !== ws) return;
        setError("Connection interrupted. Trying to rejoin…");
      };
      ws.onmessage = (event) => {
      if (cancelled || socketRef.current !== ws) return;
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "connected") {
        attempts = 0;
        setReconnectAttempt(0);
        setClientId(message.id);
        sessionTokenRef.current = message.sessionToken;
        window.localStorage.setItem("chillno-session", message.sessionToken);
        if (inviteCode && nameRef.current.trim() && !message.resumed) {
          ws.send(JSON.stringify({ type: "set_name", name: nameRef.current.trim() }));
          ws.send(JSON.stringify({ type: "join_private", code: inviteCode }));
        }
      }
      if (message.type === "lobby_state") {
        setQueues(message.queues);
      }
      if (message.type === "queue_joined") {
        setQueueSize(message.size);
      }
      if (message.type === "room_joined") {
        if (!isCompatibleRoomState(message.state)) {
          setError("The multiplayer server is out of date. Restart it, then create the room again.");
          setRoomState(null);
          setHand([]);
          return;
        }
        setRoomState(message.state);
        setHand(message.hand);
      }
      if (message.type === "state") {
        if (!isCompatibleRoomState(message.state)) {
          setError("The multiplayer server is out of date. Restart it, then reconnect.");
          return;
        }
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
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      const liveSocket = socketRef.current;
      socketRef.current = null;
      if (liveSocket) {
        liveSocket.onclose = null;
        liveSocket.onerror = null;
        liveSocket.onmessage = null;
        liveSocket.close();
      }
    };
  }, [wsUrl, connectionCycle, inviteCode]);

  function send(message: ClientMessage) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }

  function retryConnection() {
    setError(null);
    setReconnectAttempt(0);
    setConnectionCycle((cycle) => cycle + 1);
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
    send({ type: "create_private", desiredPlayers, customCode: customCode.trim() || undefined });
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
        {!connected && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#080711]/80 px-4 backdrop-blur-md"><div className="glass-panel w-full max-w-sm rounded-3xl p-7 text-center">{reconnectAttempt < MAX_RECONNECT_ATTEMPTS && <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[#b8f36b]"/>}<div className="display-font mt-5 text-xl font-bold">{reconnectAttempt >= MAX_RECONNECT_ATTEMPTS ? "Couldn’t reconnect" : "Rejoining your table…"}</div><p className="mt-2 text-sm text-slate-400">{reconnectAttempt >= MAX_RECONNECT_ATTEMPTS ? "Start the multiplayer server and try again." : `Your cards and seat are being held. Attempt ${reconnectAttempt || 1}.`}</p>{reconnectAttempt >= MAX_RECONNECT_ATTEMPTS && <button className="primary-button mt-5 px-5 py-3" onClick={retryConnection}>Retry connection</button>}</div></div>}
      </>
    );
  }

  if (roomState && clientId && roomState.status === "lobby") {
    const isHost = roomState.hostId === clientId;
    const youReady = roomState.readyPlayerIds.includes(clientId);
    const everyoneReady = roomState.players.length >= 2 && roomState.players.every((player) => roomState.readyPlayerIds.includes(player.id));
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-10">
        {copyNotice && <div className="copy-toast" role="status" aria-live="polite"><span>✓</span><div><strong>Invite copied</strong><small>Send it to your crew.</small></div></div>}
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
            <button className="secondary-button px-4 py-3 text-xs font-bold" onClick={() => { const code = roomState.roomCode; if (code) void copyInvite(code); }}>Copy invite</button>
            {roomState.roomCode && typeof navigator.share === "function" && <button className="secondary-button px-4 py-3 text-xs font-bold" onClick={() => navigator.share({ title:"Join my Chillno room", text:"Pull up to my Chillno table", url:inviteUrl(roomState.roomCode!) })}>Share</button>}
          </div>
          <div className="mt-3 text-xs text-slate-400">
            Players: {roomState.players.length} / {roomState.roomSize}
          </div>
          <div className="mt-4 space-y-2 text-xs text-slate-300">
            {roomState.players.map((player) => (
              <div key={player.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                <span>{player.name}{player.id === clientId ? " (You)" : ""}{player.id === roomState.hostId ? " · Host" : ""}</span>
                <span className={roomState.readyPlayerIds.includes(player.id) ? "text-[#b8f36b]" : "text-slate-500"}>{roomState.readyPlayerIds.includes(player.id) ? "Ready ✓" : "Not ready"}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button className={youReady ? "secondary-button px-4 py-2 text-sm" : "primary-button px-4 py-2 text-sm"} onClick={() => send({ type:"set_ready", ready:!youReady })}>{youReady ? "Not ready" : "I'm ready"}</button>
            {isHost && <button className="primary-button px-4 py-2 text-sm disabled:opacity-40" disabled={!everyoneReady} onClick={() => send({ type:"start_private" })}>Start game</button>}
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
      {copyNotice && <div className="copy-toast" role="status" aria-live="polite"><span>✓</span><div><strong>Invite copied</strong><small>Send it to your crew.</small></div></div>}
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
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { id:"public", icon:"⚡", title:"Quick Match", text:"Get matched automatically." },
            { id:"create", icon:"＋", title:"Create Room", text:"Host a private table." },
            { id:"join", icon:"→", title:"Join Room", text:"Enter a friend's code." },
          ].map((option) => <button key={option.id} className={`rounded-2xl border p-4 text-left transition ${lobbyTab === option.id ? "border-[#b8f36b]/60 bg-[#b8f36b]/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`} onClick={() => { setLobbyTab(option.id as typeof lobbyTab); setError(null); }}><span className="text-xl">{option.icon}</span><strong className="mt-2 block text-sm text-white">{option.title}</strong><small className="mt-1 block text-[11px] text-slate-400">{option.text}</small></button>)}
        </div>

        {lobbyTab !== "join" && <><div className="mt-5 text-xs font-bold uppercase tracking-widest text-slate-500">How many players?</div><div className="mt-2 grid grid-cols-3 gap-2">{[2, 3, 4].map((size) => <button key={size} className={`rounded-xl px-3 py-3 text-sm font-bold ${desiredPlayers === size ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`} onClick={() => setDesiredPlayers(size as 2 | 3 | 4)}>{size} Players</button>)}</div></>}

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
        ) : lobbyTab === "create" ? (
          <>
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4"><div className="font-bold text-white">Choose a room code <span className="font-normal text-slate-500">(optional)</span></div><p className="mt-1 text-xs text-slate-400">Make it memorable, or leave it blank and we'll generate one.</p>
            <input
              className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm uppercase tracking-widest text-slate-100 focus:border-emerald-500 focus:outline-none"
              placeholder="e.g. RAGE123"
              maxLength={10}
              value={customCode}
              onChange={(event) => setCustomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            /><div className="mt-1 text-[10px] text-slate-500">4–10 letters or numbers when provided.</div></div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className="primary-button px-6 py-3 text-sm disabled:opacity-50"
                onClick={handleCreatePrivate}
                disabled={!connected || !nameReady || (!!customCode && customCode.length < 4)}
              >
                Create My Room
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4"><div className="font-bold text-white">Enter the room code</div><p className="mt-1 text-xs text-slate-400">Ask the host for their code or open the invite link they sent.</p><input className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center display-font text-xl uppercase tracking-[.2em] text-[#b8f36b] focus:border-emerald-500 focus:outline-none" placeholder="ROOMCODE" maxLength={10} value={privateCode} onChange={(event) => setPrivateCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /></div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className="primary-button px-6 py-3 text-sm disabled:opacity-50"
                onClick={handleJoinPrivate}
                disabled={!connected || !privateCode.trim() || !nameReady}
              >
                Join This Room
              </button>
            </div>
          </>
        )}
        {error && (
          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <div>{error}</div>{reconnectAttempt >= MAX_RECONNECT_ATTEMPTS && <button className="secondary-button mt-3 px-4 py-2 text-xs" onClick={retryConnection}>Retry connection</button>}
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
