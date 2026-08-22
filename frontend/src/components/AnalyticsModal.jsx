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

function pillClass(value) {
  const good = ["high", "booked", "qualified"];
  const warn = ["medium", "partially_qualified"];
  const bad = ["low", "opted_out", "booking_failed_unresolved", "unqualified"];
  if (good.includes(value)) return "analytics-pill good";
  if (warn.includes(value)) return "analytics-pill warn";
  if (bad.includes(value)) return "analytics-pill bad";
  return "analytics-pill neutral";
}

function scoreColor(score) {
  if (score === null) return "#c3c8d3";
  if (score >= 66) return "#1c8a4b";
  if (score >= 33) return "#b5750a";
  return "#b3261e";
}

export default function AnalyticsModal({ analytics, onClose }) {
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
  const ringColor = scoreColor(leadScore);
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

        <div className="analytics-hero">
          <div className="score-ring" style={{ "--pct": leadScore ?? 0, "--ring-color": ringColor }}>
            <div className="score-ring-inner">
              <span className="score-num">{leadScore === null ? "—" : leadScore}</span>
              <span className="score-label">Lead score</span>
            </div>
          </div>
          <div className="hero-meta">
            <div className="hero-name">{fmt(a.lead_name, "Unnamed lead")}</div>
            <div className="hero-pills">
              <span className={pillClass(a.qualification_status)}>
                {fmt(a.qualification_status, "Unknown")}
              </span>
              <span className={pillClass(a.interest_level)}>{fmt(a.interest_level, "Unknown")} interest</span>
              <span className={pillClass(a.site_visit_status)}>{siteVisitLabel(a.site_visit_status)}</span>
            </div>
          </div>
        </div>

        <div className="analytics-grid">
          <div className="analytics-card card-lead">
            <div className="analytics-card-title">Lead details</div>
            <div className="analytics-row">
              <span className="analytics-label">Configuration</span>
              <span className="analytics-value">{fmt(a.configuration_interest, "Undecided")}</span>
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
            <div className="analytics-row">
              <span className="analytics-label">Language</span>
              <span className="analytics-value">{fmt(language, "Not discussed")}</span>
            </div>
            <div className="analytics-row">
              <span className="analytics-label">Intent</span>
              <span className="analytics-value">{fmt(a.intent)}</span>
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
          </div>

          <div className="analytics-card card-visit">
            <div className="analytics-card-title">Site visit</div>
            <div className="analytics-row">
              <span className="analytics-label">Date</span>
              <span className="analytics-value">{fmt(a.site_visit_date)}</span>
            </div>
            <div className="analytics-row">
              <span className="analytics-label">Time</span>
              <span className="analytics-value">{fmt(a.site_visit_time)}</span>
            </div>
          </div>

          <div className="analytics-card card-followup">
            <div className="analytics-card-title">Follow-up</div>
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
          </div>
        </div>
      </div>
    </div>
  );
}
