import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import MilestoneCard    from "../components/MilestoneCard.jsx";
import ReputationBlock  from "../components/ReputationBlock.jsx";
import { useTransaction }  from "../hooks/useTransaction.js";
import { tx_fundMilestone, fromOctas, MILESTONE_STATUS } from "../services/aptos.js";

function JobCard({ job, account, onToast, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const { run, busy } = useTransaction(onToast, onRefresh);
  const [showRep, setShowRep] = useState(false);

  const addr = account?.address ? account.address.toString() : null;
  const isClient = addr === job.client;

  const totalApt = (job.milestones || []).reduce((s, m) => s + Number(m.amount_apt || 0), 0);
  const completedCount = (job.milestones || []).filter(m => m.status === 2).length;
  const totalCount     = (job.milestones || []).length;

  return (
    <div className="card">
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div className="card-title">{job.title}</div>
          <div className="card-meta">
            <span>Client <span className="val">{job.client?.slice(0, 8)}…</span></span>
            <span>Freelancer <span className="val">{job.freelancer?.slice(0, 8)}…</span></span>
            <span>Milestones <span className="val">{completedCount}/{totalCount}</span></span>
          </div>
          {job.description && <p className="card-desc">{job.description}</p>}
        </div>
        <div style={{ textAlign: "right", minWidth: 90 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color: "var(--green)" }}>
            {fromOctas(totalApt).toFixed(2)} APT
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>total value</div>
        </div>
      </div>

      {/* Milestone progress bar */}
      <div style={{ margin: "8px 0" }}>
        <div style={{ background: "var(--border)", borderRadius: 4, height: 4, overflow: "hidden" }}>
          <div style={{
            width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
            height: "100%", background: "var(--green)", borderRadius: 4,
          }} />
        </div>
      </div>

      {/* Quick milestone status pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {(job.milestones || []).map((m, i) => {
          const st = MILESTONE_STATUS[m.status] || MILESTONE_STATUS[0];
          return (
            <span key={i} style={{
              fontFamily: "var(--mono)", fontSize: 10, padding: "2px 8px",
              borderRadius: 3, border: `1px solid ${st.color}`,
              color: st.color, background: st.color + "15",
            }}>
              #{i+1} {m.title?.slice(0, 16) || "…"} · {st.label}
            </span>
          );
        })}
      </div>

      <div className="card-actions">
        <button className="btn btn-secondary btn-sm" onClick={() => setExpanded(v => !v)}>
          {expanded ? "▲ Hide Milestones" : "▼ View Milestones"}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowRep(v => !v)}>
          {showRep ? "Hide Rep" : "View Reputation"}
        </button>
      </div>

      {/* Expanded milestones */}
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {(job.milestones || []).map((m, i) => (
            <div key={i}>
              {/* Fund button for client — greyed out once funded (tracked locally) */}
              {isClient && m.status === 0 && (
                <div style={{ marginBottom: 4 }}>
                  <button className="btn btn-gold btn-sm"
                    onClick={async () => {
                      await run(
                        tx_fundMilestone({ jobId: job.id, milestoneIndex: i }),
                        `Milestone #${i+1} funded! ${fromOctas(m.amount_apt).toFixed(2)} APT locked in escrow.`
                      );
                    }}
                    disabled={busy || m.ipfs_hash !== "" || m.submitted_at > 0}>
                    {busy
                      ? <span className="spinner" />
                      : `Fund Milestone #${i+1} — ${fromOctas(m.amount_apt).toFixed(2)} APT`}
                  </button>
                </div>
              )}
              <MilestoneCard
                milestone={m}
                index={i}
                jobId={job.id}
                jobClientAddr={job.client}
                freelancerAddr={job.freelancer}
                onToast={onToast}
                onRefresh={onRefresh}
              />
            </div>
          ))}
        </div>
      )}

      {/* Reputation blocks */}
      {showRep && (
        <div style={{ marginTop: 10 }}>
          <ReputationBlock address={job.freelancer} />
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ jobs, account, onToast, onRefresh }) {
  const [filter, setFilter] = useState("all");

  const filtered = jobs.filter(j => {
    if (filter === "client")     return j.client     === account?.address?.toString();
    if (filter === "freelancer") return j.freelancer === account?.address?.toString();
    return true;
  });

  const counts = {
    open:      jobs.flatMap(j => j.milestones || []).filter(m => m.status === 0).length,
    submitted: jobs.flatMap(j => j.milestones || []).filter(m => m.status === 1).length,
    disputed:  jobs.flatMap(j => j.milestones || []).filter(m => m.status === 4).length,
    completed: jobs.flatMap(j => j.milestones || []).filter(m => m.status === 2).length,
  };

  return (
    <div>
      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat">
          <div className="stat-val" style={{ color: "var(--gold)" }}>{counts.open}</div>
          <div className="stat-label">Open</div>
        </div>
        <div className="stat">
          <div className="stat-val" style={{ color: "var(--blue)" }}>{counts.submitted}</div>
          <div className="stat-label">In Review</div>
        </div>
        <div className="stat">
          <div className="stat-val" style={{ color: "var(--red)" }}>{counts.disputed}</div>
          <div className="stat-label">Disputed</div>
        </div>
        <div className="stat">
          <div className="stat-val" style={{ color: "var(--green)" }}>{counts.completed}</div>
          <div className="stat-label">Paid Out</div>
        </div>
        <div className="stat">
          <div className="stat-val">{jobs.length}</div>
          <div className="stat-label">Total Jobs</div>
        </div>
      </div>

      {/* Filter + refresh */}
      <div className="section-head">
        <div style={{ display: "flex", gap: 6 }}>
          {[["all","All Jobs"],["client","As Client"],["freelancer","As Freelancer"]].map(([v, l]) => (
            <button key={v}
              className={`btn btn-sm ${filter === v ? "btn-secondary" : ""}`}
              style={filter !== v ? { border: "1px solid var(--border)", color: "var(--muted)", background: "none" } : {}}
              onClick={() => setFilter(v)}>
              {l}
            </button>
          ))}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onRefresh}>↻ Refresh</button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <em>📭</em>
          No jobs found. Create one using the tab above.
        </div>
      ) : (
        <div className="job-grid">
          {filtered.map((job, i) => (
            <JobCard key={i} job={job} account={account} onToast={onToast} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}
