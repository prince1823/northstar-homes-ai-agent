import { useEffect, useRef, useState } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import SettingsModal from "./components/SettingsModal";
import {
  loadConversations,
  loadHistory,
  saveHistory,
  upsertConversation,
  loadSettings,
  saveSettings,
} from "./lib/storage";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const WELCOME = {
  role: "assistant",
  content:
    "Hi! I'm Riya from Northstar Homes 🙂 I'm reaching out about Northstar One, our new project in Sector 79, Gurugram. Do you have a couple of minutes?",
};

const TYPE_WORD_DELAY_MS = 45;

function uuid() {
  return crypto.randomUUID();
}

export default function App() {
  const [conversations, setConversations] = useState(() => loadConversations());
  const [currentId, setCurrentId] = useState(() => {
    const existing = loadConversations();
    return existing.length > 0 ? existing[0].id : uuid();
  });
  const [messages, setMessages] = useState(() => loadHistory(currentId));
  const [snapshot, setSnapshot] = useState(() => {
    const existing = loadConversations();
    return existing.find((c) => c.id === currentId)?.snapshot || null;
  });
  const [booking, setBooking] = useState(() => {
    const existing = loadConversations();
    return existing.find((c) => c.id === currentId)?.booking || null;
  });
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [settings, setSettings] = useState(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [ended, setEnded] = useState(() => {
    const existing = loadConversations();
    return existing.find((c) => c.id === currentId)?.ended || false;
  });
  const [error, setError] = useState(null);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimerRef = useRef(null);

  const busy = loading || streaming;
  const displayMessages = messages.length > 0 ? messages : [WELCOME];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [ended, currentId]);

  useEffect(() => {
    return () => clearInterval(typingTimerRef.current);
  }, []);

  function typeOutMessage(fullText) {
    return new Promise((resolve) => {
      clearInterval(typingTimerRef.current);
      setStreaming(true);
      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      const words = fullText.split(/(\s+)/);
      let i = 0;

      typingTimerRef.current = setInterval(() => {
        i++;
        const partial = words.slice(0, i).join("");
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: partial };
          return copy;
        });
        if (i >= words.length) {
          clearInterval(typingTimerRef.current);
          setStreaming(false);
          resolve();
        }
      }, TYPE_WORD_DELAY_MS);
    });
  }

  function persistMessages(id, msgs, endedFlag) {
    saveHistory(id, msgs);
    const firstUser = msgs.find((m) => m.role === "user");
    const title = firstUser ? firstUser.content.slice(0, 60) : "New conversation";
    const list = upsertConversation({ id, title, updatedAt: Date.now(), ended: endedFlag });
    setConversations(list);
  }

  function persistSnapshotCache(id, snap) {
    const list = upsertConversation({ id, snapshot: snap, updatedAt: Date.now() });
    setConversations(list);
  }

  function persistBookingCache(id, bookingResult) {
    const list = upsertConversation({ id, booking: bookingResult, updatedAt: Date.now() });
    setConversations(list);
  }

  async function refreshSnapshot(id) {
    setSnapshotLoading(true);
    try {
      const res = await fetch(`${API_URL}/snapshot/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: settings.apiKey || undefined,
          model: settings.model || undefined,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.analytics && Object.keys(data.analytics).length > 0) {
        setSnapshot(data.analytics);
        persistSnapshotCache(id, data.analytics);
      }
    } catch {
      // best-effort background refresh — ignore failures
    } finally {
      setSnapshotLoading(false);
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || ended) return;

    setError(null);
    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: currentId,
          message: text,
          history: messages,
          api_key: settings.apiKey || undefined,
          model: settings.model || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setLoading(false);
      await typeOutMessage(data.reply);

      const finalMessages = [...newMessages, { role: "assistant", content: data.reply }];
      persistMessages(currentId, finalMessages, false);
      if (data.booking) {
        setBooking(data.booking);
        persistBookingCache(currentId, data.booking);
      }
      refreshSnapshot(currentId);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function endConversation() {
    if (ended || busy || !messages.some((m) => m.role === "user")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/end/${currentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: settings.apiKey || undefined,
          model: settings.model || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setSnapshot(data.analytics);
      setEnded(true);
      persistMessages(currentId, messages, true);
      persistSnapshotCache(currentId, data.analytics);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startNewConversation() {
    clearInterval(typingTimerRef.current);
    setStreaming(false);
    setCurrentId(uuid());
    setMessages([]);
    setEnded(false);
    setSnapshot(null);
    setBooking(null);
    setError(null);
  }

  function selectConversation(id) {
    if (id === currentId || busy) return;
    clearInterval(typingTimerRef.current);
    setStreaming(false);
    setCurrentId(id);
    const hist = loadHistory(id);
    setMessages(hist);
    const conv = conversations.find((c) => c.id === id);
    setEnded(conv?.ended || false);
    setSnapshot(conv?.snapshot || null);
    setBooking(conv?.booking || null);
    setError(null);
    if (!conv?.ended && hist.length > 0) {
      refreshSnapshot(id);
    }
  }

  function handleSaveSettings(newSettings) {
    setSettings(newSettings);
    saveSettings(newSettings);
  }

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentId={currentId}
        onSelectConversation={selectConversation}
        onNewChat={startNewConversation}
        snapshot={snapshot}
        booking={booking}
        snapshotLoading={snapshotLoading}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main className="main">
        <header className="chat-header">
          <div className="chat-header-left">
            <div className="avatar assistant-avatar">H</div>
            <div>
              <div className="chat-header-title">Huvo Agent</div>
              <div className="chat-header-subtitle">Northstar Homes</div>
            </div>
          </div>
          <div className="chat-header-actions">
            <button
              className="btn primary"
              onClick={endConversation}
              disabled={ended || busy || !messages.some((m) => m.role === "user")}
            >
              End conversation
            </button>
          </div>
        </header>

        <div className="chat-window">
          <div className="chat-window-inner">
            {displayMessages.map((m, i) => (
              <div key={i} className={`bubble-row ${m.role}`}>
                {m.role === "assistant" && <div className="avatar assistant-avatar small">H</div>}
                <div className={`bubble ${m.role}`}>{m.content}</div>
                {m.role === "user" && <div className="avatar user-avatar small">You</div>}
              </div>
            ))}
            {loading && (
              <div className="bubble-row assistant">
                <div className="avatar assistant-avatar small">H</div>
                <div className="bubble assistant typing">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            )}
            {error && <div className="error-banner">⚠ {error}</div>}
            <div ref={bottomRef} />
          </div>
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <div className="composer-inner">
            <input
              ref={inputRef}
              type="text"
              placeholder={ended ? "Conversation ended" : "Type a message… English, Hindi, or Hinglish"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={ended || busy}
            />
            <button className="btn primary send-btn" type="submit" disabled={ended || busy || !input.trim()}>
              Send
            </button>
          </div>
        </form>
      </main>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
