import { useEffect, useRef, useState } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import SettingsModal from "./components/SettingsModal";
import AnalyticsModal from "./components/AnalyticsModal";
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
  // Final, end-of-conversation analytics only — no live per-turn LLM calls.
  const [analytics, setAnalytics] = useState(() => {
    const existing = loadConversations();
    return existing.find((c) => c.id === currentId)?.analytics || null;
  });
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [settings, setSettings] = useState(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("huvo_sidebar_collapsed") === "true"
  );

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [ending, setEnding] = useState(false);
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

  // `ending` is deliberately separate from `loading` — loading drives the
  // chat's typing-dots bubble (a real reply is being generated), whereas
  // ending a conversation just fetches analytics in the background and
  // should never make it look like the agent is typing a new message.
  const busy = loading || streaming || ending;
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
    const entry = { id, updatedAt: Date.now(), ended: endedFlag };
    const existing = conversations.find((c) => c.id === id);
    if (!existing?.title) {
      // Fallback title until the one-time /title call (see generateTitle)
      // resolves; never recomputed on later turns so it doesn't clobber a
      // generated title.
      const firstUser = msgs.find((m) => m.role === "user");
      entry.title = firstUser ? firstUser.content.slice(0, 60) : "New conversation";
    }
    const list = upsertConversation(entry);
    setConversations(list);
  }

  async function generateTitle(id, msgs) {
    // Best-effort, one-time-per-conversation title upgrade — runs once, after
    // the customer's 3rd message (by then there's enough context for a good
    // title), so it adds at most one extra LLM call per conversation, not one
    // per turn. Silently keeps the truncated fallback title from
    // persistMessages if this fails.
    try {
      const res = await fetch(`${API_URL}/title/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: msgs,
          api_key: settings.apiKey || undefined,
          model: settings.model || undefined,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.title) {
        const list = upsertConversation({ id, title: data.title });
        setConversations(list);
      }
    } catch {
      // ignore — fallback title stays
    }
  }

  function persistAnalyticsCache(id, result) {
    // Caches the one-time, end-of-conversation analytics result so reopening
    // an ended conversation can show it again via "View analytics" without
    // another LLM call. Deliberately doesn't touch updatedAt.
    const list = upsertConversation({ id, analytics: result });
    setConversations(list);
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
      const userMessageCount = newMessages.filter((m) => m.role === "user").length;
      persistMessages(currentId, finalMessages, false);
      if (userMessageCount === 3) {
        generateTitle(currentId, finalMessages);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function endConversation() {
    if (ended || busy || !messages.some((m) => m.role === "user")) return;
    setEnding(true);
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
      setAnalytics(data.analytics);
      setShowAnalyticsModal(true);
      setEnded(true);
      persistMessages(currentId, messages, true);
      persistAnalyticsCache(currentId, data.analytics);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnding(false);
    }
  }

  function startNewConversation() {
    clearInterval(typingTimerRef.current);
    setStreaming(false);
    setCurrentId(uuid());
    setMessages([]);
    setEnded(false);
    setAnalytics(null);
    setShowAnalyticsModal(false);
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
    setAnalytics(conv?.analytics || null);
    setShowAnalyticsModal(false);
    setError(null);
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
      setAnalytics(next.analytics || null);
    } else {
      setCurrentId(uuid());
      setMessages([]);
      setEnded(false);
      setAnalytics(null);
      typeOutWelcome();
    }
    setShowAnalyticsModal(false);
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
            {ended && analytics && (
              <button className="btn ghost compact" onClick={() => setShowAnalyticsModal(true)}>
                View analytics
              </button>
            )}
            <button
              className="btn ghost compact"
              onClick={endConversation}
              disabled={ended || busy || !messages.some((m) => m.role === "user")}
            >
              {ending ? "Ending…" : "End conversation"}
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

      {showAnalyticsModal && analytics && (
        <AnalyticsModal analytics={analytics} onClose={() => setShowAnalyticsModal(false)} />
      )}
    </div>
  );
}
