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

export default function Sidebar({
  conversations,
  currentId,
  onSelectConversation,
  onDeleteConversation,
  onNewChat,
  onOpenSettings,
  collapsed,
  onToggleCollapse,
}) {
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
        <div className="side-section side-section-grow">
          <div className="side-section-title">Conversations</div>
          <button className="btn primary full-width small-btn" onClick={onNewChat}>
            + New Chat
          </button>
          <div className="conversation-list">
            {conversations.length === 0 && <div className="side-empty">No conversations yet</div>}
            {conversations.map((c) => (
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
      </div>

      {/* 3. Settings */}
      <button className="settings-footer-btn" onClick={onOpenSettings}>
        Settings
      </button>
    </aside>
  );
}
