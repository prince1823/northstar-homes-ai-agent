import { useMemo, useState } from "react";

function fmt(v, fallback = "—") {
  if (v === null || v === undefined || v === "" || v === "not_discussed") return fallback;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = String(v).replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function relativeTime(ts) {
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function siteVisitLabel(status) {
  if (status === "booked") return "Booked";
  if (status === "booking_failed_unresolved") return "Failed";
  if (status === "declined_by_customer") return "Declined";
  return "Not Booked";
}

function siteVisitClass(status) {
  if (status === "booked") return "pill good";
  if (status === "booking_failed_unresolved") return "pill bad";
  if (status === "declined_by_customer") return "pill neutral";
  return "pill neutral";
}

function interestClass(level) {
  if (level === "high") return "pill good";
  if (level === "medium") return "pill warn";
  if (level === "low") return "pill neutral";
  if (level === "opted_out") return "pill bad";
  return "pill neutral";
}

function qualificationClass(status) {
  if (status === "qualified") return "pill good";
  if (status === "partially_qualified") return "pill warn";
  if (status === "unqualified") return "pill bad";
  return "pill neutral";
}

export default function Sidebar({
  conversations,
  currentId,
  onSelectConversation,
  onDeleteConversation,
  onNewChat,
  snapshot,
  booking,
  snapshotLoading,
  onOpenSettings,
  collapsed,
  onToggleCollapse,
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  const s = snapshot || {};
  const leadScore = typeof s.lead_score === "number" ? s.lead_score : null;

  // The structured `booking` object (from the actual booking attempt) is the
  // authoritative source once it exists; the LLM-extracted snapshot fields
  // are a best-effort fallback for a preference stated before any attempt.
  const visitStatus = booking ? (booking.success ? "booked" : "booking_failed_unresolved") : s.site_visit_status;
  const visitDate = booking?.date || s.site_visit_date;
  const visitTime = booking?.time || s.site_visit_time;

  // preferred_language is the model's own judgment call and occasionally
  // comes back "not_discussed" even when language_used (a simpler, more
  // reliable extraction) shows what was actually used — fall back to that.
  const language =
    s.preferred_language && s.preferred_language !== "not_discussed"
      ? s.preferred_language
      : Array.isArray(s.language_used) && s.language_used.length > 0
        ? s.language_used.join(", ")
        : null;

  function handleDelete(e, id) {
    e.stopPropagation();
    if (window.confirm("Delete this conversation? This can't be undone.")) {
      onDeleteConversation(id);
    }
  }

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <button
        className="sidebar-toggle-icon"
        onClick={onToggleCollapse}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
          <line x1="7.75" y1="4" x2="7.75" y2="16" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      <div className="sidebar-scroll">
        {/* 1. Project */}
        <div className="side-section">
          <div className="side-section-title">Northstar Homes</div>
          <div className="side-row">
            <span className="side-row-label">Project</span>
            <span className="side-row-value">Northstar One</span>
          </div>
          <div className="side-row">
            <span className="side-row-label">Location</span>
            <span className="side-row-value">Sector 79, Gurugram</span>
          </div>
        </div>

        {/* 2. Conversations */}
        <div className="side-section">
          <div className="side-section-title">Conversations</div>
          <button className="btn primary full-width small-btn" onClick={onNewChat}>
            + New Chat
          </button>
          <input
            className="side-search"
            type="text"
            placeholder="Search chats…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="conversation-list">
            {filtered.length === 0 && <div className="side-empty">No conversations yet</div>}
            {filtered.map((c) => (
              <div
                key={c.id}
                className={`conversation-item ${c.id === currentId ? "active" : ""}`}
                onClick={() => onSelectConversation(c.id)}
                role="button"
                tabIndex={0}
              >
                <div className="conversation-item-main">
                  <div className="conversation-item-title">{c.title || "New conversation"}</div>
                  <div className="conversation-item-meta">
                    {c.ended ? "Ended" : "Active"} · {relativeTime(c.updatedAt)}
                  </div>
                </div>
                <button
                  className="conversation-item-delete"
                  onClick={(e) => handleDelete(e, c.id)}
                  aria-label="Delete conversation"
                  title="Delete conversation"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Lead Information */}
        <div className="side-section">
          <div className="side-section-title">
            Lead Information {snapshotLoading && <span className="side-loading">updating…</span>}
          </div>
          <div className="side-row">
            <span className="side-row-label">Name</span>
            <span className="side-row-value">{fmt(s.lead_name)}</span>
          </div>
          <div className="side-row">
            <span className="side-row-label">Configuration</span>
            <span className="side-row-value">{fmt(s.configuration_interest, "Undecided")}</span>
          </div>
          <div className="side-row">
            <span className="side-row-label">Interest level</span>
            <span className={interestClass(s.interest_level)}>{fmt(s.interest_level, "Unknown")}</span>
          </div>
          <div className="side-row">
            <span className="side-row-label">Language</span>
            <span className="side-row-value">{fmt(language, "Not discussed")}</span>
          </div>
          <div className="side-row stacked">
            <span className="side-row-label">Budget</span>
            <span className="side-row-value wrap">{fmt(s.budget_signal, "Not discussed")}</span>
          </div>
        </div>

        {/* 4. Site Visit */}
        <div className="side-section">
          <div className="side-section-title">Site Visit</div>
          <div className="side-row">
            <span className="side-row-label">Status</span>
            <span className={siteVisitClass(visitStatus)}>{siteVisitLabel(visitStatus)}</span>
          </div>
          <div className="side-row">
            <span className="side-row-label">Date</span>
            <span className="side-row-value">{fmt(visitDate)}</span>
          </div>
          <div className="side-row">
            <span className="side-row-label">Time</span>
            <span className="side-row-value">{fmt(visitTime)}</span>
          </div>
        </div>

        {/* 5. Follow-up */}
        <div className="side-section">
          <div className="side-section-title">Follow-up</div>
          <div className="side-row">
            <span className="side-row-label">Required</span>
            <span className="side-row-value">{fmt(s.follow_up_required, "No")}</span>
          </div>
          <div className="side-row stacked">
            <span className="side-row-label">Follow-up date</span>
            <span className="side-row-value wrap">{fmt(s.follow_up_date || s.follow_up_notes)}</span>
          </div>
        </div>

        {/* 6. Conversation Analytics */}
        <div className="side-section">
          <div className="side-section-title">Conversation Analytics</div>
          <div className="side-row">
            <span className="side-row-label">Lead score</span>
            <span className="side-row-value">{leadScore === null ? "—" : `${leadScore}/100`}</span>
          </div>
          {leadScore !== null && (
            <div className="lead-score-bar">
              <div
                className="lead-score-fill"
                style={{ width: `${leadScore}%`, background: leadScore >= 66 ? "#1c8a4b" : leadScore >= 33 ? "#b5750a" : "#b3261e" }}
              />
            </div>
          )}
          <div className="side-row stacked">
            <span className="side-row-label">Intent</span>
            <span className="side-row-value wrap">{fmt(s.intent)}</span>
          </div>
          <div className="side-row">
            <span className="side-row-label">Qualification</span>
            <span className={qualificationClass(s.qualification_status)}>
              {fmt(s.qualification_status, "Unknown")}
            </span>
          </div>
          {s.conversation_summary && (
            <div className="side-summary">{s.conversation_summary}</div>
          )}
        </div>
      </div>

      {/* 7. Settings */}
      <button className="settings-footer-btn" onClick={onOpenSettings}>
        Settings
      </button>
    </aside>
  );
}
