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
        <div className="side-section side-section-accent">
          <div className="side-section-title">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1V8.5Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            Northstar Homes
          </div>
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
          <div className="side-section-title">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M3 4.5h14a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H8l-3.5 3V14H3a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            Conversations
          </div>
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
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M8.6 2.5h2.8l.4 1.9c.5.16.97.39 1.4.67l1.83-.7 1.4 2.42-1.5 1.24c.05.28.07.57.07.87s-.02.59-.07.87l1.5 1.24-1.4 2.42-1.83-.7c-.43.28-.9.51-1.4.67l-.4 1.9H8.6l-.4-1.9a5.9 5.9 0 0 1-1.4-.67l-1.83.7-1.4-2.42 1.5-1.24A5.5 5.5 0 0 1 4.4 10c0-.3.02-.59.07-.87l-1.5-1.24 1.4-2.42 1.83.7c.43-.28.9-.51 1.4-.67l.4-1.9Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <circle cx="10" cy="10" r="2.1" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        Settings
      </button>
    </aside>
  );
}
