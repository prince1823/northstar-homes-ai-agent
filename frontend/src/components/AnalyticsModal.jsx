function fmt(v, fallback = "—") {
  if (v === null || v === undefined || v === "" || v === "not_discussed") return fallback;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = String(v).replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function siteVisitLabel(status) {
  if (status === "booked") return "Booked";
  if (status === "booking_failed_unresolved") return "Failed";
  if (status === "declined_by_customer") return "Declined";
  return "Not Booked";
}

function pillClass(kind, value) {
  const good = ["high", "booked", "qualified"];
  const warn = ["medium", "partially_qualified"];
  const bad = ["low", "opted_out", "booking_failed_unresolved", "unqualified"];
  if (good.includes(value)) return "analytics-pill good";
  if (warn.includes(value)) return "analytics-pill warn";
  if (bad.includes(value)) return "analytics-pill bad";
  return "analytics-pill neutral";
}

export default function AnalyticsModal({ analytics, onClose, onStartNew }) {
  if (!analytics) return null;

  if (analytics.error) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Conversation Analytics</h2>
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="error-banner">⚠ {analytics.error}</div>
        </div>
      </div>
    );
  }

  const a = analytics;
  const leadScore = typeof a.lead_score === "number" ? a.lead_score : null;
  const language =
    a.preferred_language && a.preferred_language !== "not_discussed"
      ? a.preferred_language
      : Array.isArray(a.language_used) && a.language_used.length > 0
        ? a.language_used.join(", ")
        : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal analytics-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Conversation Analytics</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {a.conversation_summary && <div className="analytics-summary">{a.conversation_summary}</div>}

        <div className="analytics-section-label">Lead</div>
        <div className="analytics-row">
          <span className="analytics-label">Name</span>
          <span className="analytics-value">{fmt(a.lead_name)}</span>
        </div>
        <div className="analytics-row">
          <span className="analytics-label">Configuration</span>
          <span className="analytics-value">{fmt(a.configuration_interest, "Undecided")}</span>
        </div>
        <div className="analytics-row">
          <span className="analytics-label">Interest level</span>
          <span className={pillClass("interest", a.interest_level)}>{fmt(a.interest_level, "Unknown")}</span>
        </div>
        <div className="analytics-row">
          <span className="analytics-label">Language</span>
          <span className="analytics-value">{fmt(language, "Not discussed")}</span>
        </div>
        <div className="analytics-row">
          <span className="analytics-label">Budget</span>
          <span className="analytics-value">{fmt(a.budget_signal, "Not discussed")}</span>
        </div>
        <div className="analytics-row">
          <span className="analytics-label">Purpose</span>
          <span className="analytics-value">{fmt(a.purpose, "Not discussed")}</span>
        </div>
        <div className="analytics-row">
          <span className="analytics-label">Timeline</span>
          <span className="analytics-value">{fmt(a.timeline, "Not discussed")}</span>
        </div>

        {Array.isArray(a.objections_raised) && a.objections_raised.length > 0 && (
          <div className="analytics-row">
            <span className="analytics-label">Objections</span>
            <span className="analytics-chips">
              {a.objections_raised.map((o, i) => (
                <span className="analytics-chip" key={i}>
                  {o}
                </span>
              ))}
            </span>
          </div>
        )}

        <div className="analytics-section-label">Site Visit</div>
        <div className="analytics-row">
          <span className="analytics-label">Status</span>
          <span className={pillClass("visit", a.site_visit_status)}>{siteVisitLabel(a.site_visit_status)}</span>
        </div>
        <div className="analytics-row">
          <span className="analytics-label">Date</span>
          <span className="analytics-value">{fmt(a.site_visit_date)}</span>
        </div>
        <div className="analytics-row">
          <span className="analytics-label">Time</span>
          <span className="analytics-value">{fmt(a.site_visit_time)}</span>
        </div>

        <div className="analytics-section-label">Follow-up</div>
        <div className="analytics-row">
          <span className="analytics-label">Required</span>
          <span className="analytics-value">{fmt(a.follow_up_required, "No")}</span>
        </div>
        <div className="analytics-row">
          <span className="analytics-label">Notes</span>
          <span className="analytics-value">{fmt(a.follow_up_date || a.follow_up_notes)}</span>
        </div>
        {a.human_escalation_needed && (
          <div className="analytics-row">
            <span className="analytics-label">Escalation</span>
            <span className="analytics-value">{fmt(a.escalation_reason, "Needed")}</span>
          </div>
        )}

        <div className="analytics-section-label">Lead Score</div>
        <div className="analytics-row">
          <span className="analytics-label">Score</span>
          <span className="analytics-value">{leadScore === null ? "—" : `${leadScore}/100`}</span>
        </div>
        {leadScore !== null && (
          <div className="lead-score-bar light">
            <div
              className="lead-score-fill"
              style={{
                width: `${leadScore}%`,
                background: leadScore >= 66 ? "#1c8a4b" : leadScore >= 33 ? "#b5750a" : "#b3261e",
              }}
            />
          </div>
        )}
        <div className="analytics-row">
          <span className="analytics-label">Intent</span>
          <span className="analytics-value">{fmt(a.intent)}</span>
        </div>
        <div className="analytics-row">
          <span className="analytics-label">Qualification</span>
          <span className={pillClass("qualification", a.qualification_status)}>
            {fmt(a.qualification_status, "Unknown")}
          </span>
        </div>

        <button className="btn ghost full-width" onClick={onStartNew}>
          Start a new conversation
        </button>
      </div>
    </div>
  );
}
