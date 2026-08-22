import { useEffect, useRef, useState } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import SettingsModal from "./components/SettingsModal";
import {
  loadConversations,
  loadHistory,
  saveHistory,
  upsertConversation,
  deleteConversation,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("huvo_sidebar_collapsed") === "true"
  );

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [ended, setEnded] = useState(() => {
    const existing = loadConversations();
    return existing.find((c) => c.id === currentId)?.ended || false;
  });
  const [error, setError] = useState(null);
  const [welcomeText, setWelcomeText] = useState("");

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const welcomeTimerRef = useRef(null);

  const busy = loading || streaming;
  const welcomeBubble = {
    role: "assistant",
    content: messages.length === 0 ? welcomeText : WELCOME.content,
  };
  const displayMessages = [welcomeBubble, ...messages];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, welcomeText]);

  useEffect(() => {
    if (!busy && !ended) {
      inputRef.current?.focus();
    }
  }, [ended, currentId, busy]);

  useEffect(() => {
    if (messages.length === 0) {
      typeOutWelcome();
    }
    return () => {
      clearInterval(typingTimerRef.current);
      clearInterval(welcomeTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function typeOutWelcome() {
    clearInterval(welcomeTimerRef.current);
    setWelcomeText("");
    const words = WELCOME.content.split(/(\s+)/);
    let i = 0;
    welcomeTimerRef.current = setInterval(() => {
      i++;
      setWelcomeText(words.slice(0, i).join(""));
      if (i >= words.length) {
        clearInterval(welcomeTimerRef.current);
      }
    }, TYPE_WORD_DELAY_MS);
  }

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
    // Deliberately doesn't touch updatedAt — this can be triggered just from
    // viewing/reopening a conversation, not only from new activity, and the
    // list's sort order should only move on real activity (persistMessages).
    const list = upsertConversation({ id, snapshot: snap });
    setConversations(list);
  }

  function persistBookingCache(id, bookingResult) {
    const list = upsertConversation({ id, booking: bookingResult });
    setConversations(list);
  }

  async function refreshSnapshot(id, history) {
    setSnapshotLoading(true);
    try {
      const res = await fetch(`${API_URL}/snapshot/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history,
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
      refreshSnapshot(currentId, finalMessages);
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
    typeOutWelcome();
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
    // Only fetch a fresh snapshot if we don't already have one cached — an
    // already-cached snapshot for a past conversation is still accurate
    // (nothing changed since we last saw it), so re-fetching on every open
    // just causes a needless "updating…" flicker and API call.
    if (!conv?.snapshot && !conv?.ended && hist.length > 0) {
      refreshSnapshot(id, hist);
    }
  }

  function handleDeleteConversation(id) {
    const list = deleteConversation(id);
    setConversations(list);

    if (id !== currentId) return;

    clearInterval(typingTimerRef.current);
    setStreaming(false);
    if (list.length > 0) {
      const next = list[0];
      setCurrentId(next.id);
      setMessages(loadHistory(next.id));
      setEnded(next.ended || false);
      setSnapshot(next.snapshot || null);
      setBooking(next.booking || null);
    } else {
      setCurrentId(uuid());
      setMessages([]);
      setEnded(false);
      setSnapshot(null);
      setBooking(null);
      typeOutWelcome();
    }
    setError(null);
  }

  function handleSaveSettings(newSettings) {
    setSettings(newSettings);
    saveSettings(newSettings);
  }

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("huvo_sidebar_collapsed", String(next));
      return next;
    });
  }

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentId={currentId}
        onSelectConversation={selectConversation}
        onDeleteConversation={handleDeleteConversation}
        onNewChat={startNewConversation}
        snapshot={snapshot}
        booking={booking}
        snapshotLoading={snapshotLoading}
        onOpenSettings={() => setShowSettings(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      <main className="main">
        <header className={`chat-header ${sidebarCollapsed ? "with-sidebar-collapsed" : ""}`}>
          <div className="chat-header-left">
            <div className="avatar assistant-avatar">R</div>
            <div>
              <div className="chat-header-title">Riya</div>
              <div className="chat-header-subtitle">Northstar Homes</div>
            </div>
          </div>
          <div className="chat-header-actions">
            <button
              className="btn ghost compact"
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
                {m.role === "assistant" && <div className="avatar assistant-avatar small">R</div>}
                <div className={`bubble ${m.role}`}>{m.content}</div>
                {m.role === "user" }
              </div>
            ))}
            {loading && (
              <div className="bubble-row assistant">
                <div className="avatar assistant-avatar small">R</div>
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
              placeholder={ended ? "Conversation ended" : "Type a message..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(e);
                }
              }}
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
