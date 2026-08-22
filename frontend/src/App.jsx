import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const WELCOME = {
  role: "assistant",
  content:
    "Hi! I'm Riya from Northstar Homes 🙂 I'm reaching out about Northstar One, our new project in Sector 79, Gurugram. Do you have a couple of minutes?",
};

const TYPE_WORD_DELAY_MS = 45;

const ANALYTICS_FIELDS = [
  ["configuration_interest", "Configuration"],
  ["budget_signal", "Budget signal"],
  ["purpose", "Purpose"],
  ["timeline", "Timeline"],
  ["interest_level", "Interest level"],
  ["site_visit_status", "Site visit status"],
  ["site_visit_details", "Site visit details"],
  ["follow_up_required", "Follow-up required"],
  ["follow_up_notes", "Follow-up notes"],
  ["human_escalation_needed", "Escalation needed"],
  ["escalation_reason", "Escalation reason"],
];

function uuid() {
  return crypto.randomUUID();
}

function formatValue(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return String(v);
}

function badgeClass(level) {
  if (level === "high") return "badge high";
  if (level === "medium") return "badge medium";
  if (level === "low") return "badge low";
  if (level === "opted_out") return "badge out";
  return "badge neutral";
}

export default function App() {
  const [sessionId, setSessionId] = useState(() => uuid());
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [ended, setEnded] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimerRef = useRef(null);

  const busy = loading || streaming;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [ended]);

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

  async function sendMessage(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || ended) return;

    setError(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setSessionId(data.session_id);
      setLoading(false);
      await typeOutMessage(data.reply);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function endConversation() {
    if (ended || busy) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/end/${sessionId}`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setAnalytics(data.analytics);
      setShowAnalytics(true);
      setEnded(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startNewConversation() {
    clearInterval(typingTimerRef.current);
    setStreaming(false);
    setSessionId(uuid());
    setMessages([WELCOME]);
    setEnded(false);
    setAnalytics(null);
    setShowAnalytics(false);
    setError(null);
  }

  return (
    <div className="app">
      <main className="main full-width">
        <header className="chat-header">
          <div className="chat-header-left">
            <div className="avatar assistant-avatar">H</div>
            <div>
              <div className="chat-header-title">Huvo Agent</div>
              <div className="chat-header-subtitle">Northstar Homes</div>
            </div>
          </div>
          <div className="chat-header-actions">
            <button className="btn ghost" onClick={startNewConversation}>
              New conversation
            </button>
            <button
              className="btn primary"
              onClick={endConversation}
              disabled={ended || busy || messages.length < 2}
            >
              End conversation
            </button>
          </div>
        </header>

        <div className="chat-window">
          <div className="chat-window-inner">
            {messages.map((m, i) => (
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

      {showAnalytics && analytics && (
        <div className="modal-overlay" onClick={() => setShowAnalytics(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Conversation Analytics</h2>
              <button className="modal-close" onClick={() => setShowAnalytics(false)}>
                ✕
              </button>
            </div>

            {analytics.error ? (
              <div className="error-banner">⚠ {analytics.error}</div>
            ) : (
              <>
                <div className="analytics-summary">
                  {analytics.conversation_summary || "No summary available."}
                </div>

                <div className="analytics-badges">
                  <span className={badgeClass(analytics.interest_level)}>
                    Interest: {formatValue(analytics.interest_level)}
                  </span>
                  <span className="badge neutral">
                    Site visit: {formatValue(analytics.site_visit_status)}
                  </span>
                  {Array.isArray(analytics.language_used) && analytics.language_used.length > 0 && (
                    <span className="badge neutral">
                      Language: {analytics.language_used.join(", ")}
                    </span>
                  )}
                </div>

                <div className="analytics-grid">
                  {ANALYTICS_FIELDS.map(([key, label]) => (
                    <div className="analytics-item" key={key}>
                      <div className="analytics-item-label">{label}</div>
                      <div className="analytics-item-value">{formatValue(analytics[key])}</div>
                    </div>
                  ))}
                </div>

                {Array.isArray(analytics.objections_raised) && analytics.objections_raised.length > 0 && (
                  <div className="analytics-objections">
                    <div className="analytics-item-label">Objections raised</div>
                    <div className="objection-chips">
                      {analytics.objections_raised.map((o, i) => (
                        <span className="chip" key={i}>
                          {o}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <button className="btn ghost full-width" onClick={startNewConversation}>
              Start a new conversation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
