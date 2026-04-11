import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useTransaction } from "../hooks/useTransaction.js";
import {
  fromOctas, MILESTONE_STATUS,
  tx_approveMilestone, tx_rejectMilestone,
  tx_rateFreelancer, uploadToIPFS, ipfsUrl,
} from "../services/aptos.js";

function MilestoneRow({ m, i, job, onToast, onRefresh }) {
  const { run, busy } = useTransaction(onToast, onRefresh);
  const [note, setNote] = useState("");
  const [showVerdict, setShowVerdict] = useState(false);
  const [rating, setRating] = useState(0);
  const st = MILESTONE_STATUS[m.status] || MILESTONE_STATUS[0];

  async function handleVerdict(approve) {
    const cid = await uploadToIPFS(new Blob([note || "(no notes)"], { type: "text/plain" }));
    const tx  = approve
      ? tx_approveMilestone({ jobId: job.id, milestoneIndex: i, verdictIpfs: cid })
      : tx_rejectMilestone ({ jobId: job.id, milestoneIndex: i, verdictIpfs: cid });
    await run(tx, approve ? "✓ Approved — payment released!" : "✗ Rejected — freelancer notified.");
    setShowVerdict(false);
  }

  return (
    <div className="milestone-card">
      <div className="milestone-header">
        <span className="milestone-title">#{i + 1} — {m.title}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--green)" }}>
            {fromOctas(m.amount_apt).toFixed(2)} APT
          </span>
          <span className="badge" style={{ color: st.color, borderColor: st.color, background: st.color + "18" }}>
            {st.label}
          </span>
        </div>
      </div>

      {m.description && <div className="milestone-body">{m.description}</div>}

      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
        Deadline: {new Date(m.deadline_secs * 1000).toLocaleDateString()}
        {m.moderator && m.moderator !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
          <span style={{ marginLeft: 12 }}>Moderator: {m.moderator.slice(0, 8)}…</span>
        )}
      </div>

      {/* Submitted work */}
      {m.ipfs_hash && (
        <div className="ipfs-hash">
          ↳ Work: <a href={ipfsUrl(m.ipfs_hash)} target="_blank" rel="noreferrer">{m.ipfs_hash}</a>
          {m.submission_sig && <span style={{ marginLeft: 8, color: "var(--green)" }}>✓ Signed</span>}
        </div>
      )}

      {/* Actions */}
      <div className="card-actions">
        {/* Status 0: open — show funded badge (auto-funded on creation) */}
        {m.status === 0 && (
          <span style={{
            fontFamily: "var(--mono)", fontSize: 11, padding: "3px 10px",
            borderRadius: 3, border: "1px solid var(--green)", color: "var(--green)",
            background: "rgba(34,197,94,.08)"
          }}>
            ✓ Funded — {fromOctas(m.amount_apt).toFixed(2)} APT locked
          </span>
        )}

        {/* Status 1: submitted — client can approve or reject */}
        {m.status === 1 && (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => setShowVerdict(v => !v)}>
              Review Submission
            </button>
            {showVerdict && (
              <div style={{ width: "100%", marginTop: 8 }}>
                <textarea
                  value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Write your assessment notes (stored on IPFS)…"
                  style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)",
                    color: "var(--text)", borderRadius: 6, padding: "8px 10px",
                    fontFamily: "var(--sans)", fontSize: 12, minHeight: 60, resize: "vertical", outline: "none" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => handleVerdict(true)} disabled={busy}>
                    {busy ? <span className="spinner" /> : "✓ Accept"}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleVerdict(false)} disabled={busy}>
                    {busy ? <span className="spinner" /> : "✗ Reject & Dispute"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Status 4: disputed — waiting for moderator resolution */}
        {m.status === 4 && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--orange)" }}>
            ⚠ In dispute — awaiting moderator resolution
          </span>
        )}

        {/* Status 2: approved — client rates freelancer */}
        {m.status === 2 && rating === 0 && (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>Rate:</span>
            {[1,2,3,4,5].map(s => (
              <button key={s}
                onClick={() => { setRating(s); run(tx_rateFreelancer({ jobId: job.id, milestoneIndex: i, stars: s }), `Rated ${s}★`); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18,
                  color: s <= rating ? "var(--gold)" : "var(--border)" }}>★</button>
            ))}
          </div>
        )}
        {rating > 0 && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--gold)" }}>★ {rating} rated</span>
        )}
      </div>
    </div>
  );
}

export default function ClientJobs({ jobs, account, onToast, onRefresh }) {
  const addr = account?.address?.toString();
  const [expanded, setExpanded] = useState({});

  const myJobs = jobs.filter(j => j.client === addr);

  const toggle = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  if (myJobs.length === 0) {
    return (
      <div className="empty">
        <em>📋</em>
        No jobs created yet. Use "+ Create Job" to post your first job.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {myJobs.map(job => {
        const completedCount = job.milestones.filter(m => m.status === 2).length;
        const totalApt = job.milestones.reduce((s, m) => s + m.amount_apt, 0);
        return (
          <div key={job.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="card-title">{job.title}</div>
                <div className="card-meta">
                  <span>Freelancer <span className="val">{job.freelancer?.slice(0,8)}…</span></span>
                  <span>Progress <span className="val">{completedCount}/{job.milestones.length}</span></span>
                </div>
                {job.description && <p className="card-desc">{job.description}</p>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color: "var(--green)" }}>
                  {fromOctas(totalApt).toFixed(2)} APT
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ background: "var(--border)", borderRadius: 4, height: 4, margin: "8px 0", overflow: "hidden" }}>
              <div style={{ width: `${job.milestones.length > 0 ? (completedCount / job.milestones.length) * 100 : 0}%`,
                height: "100%", background: "var(--green)", borderRadius: 4 }} />
            </div>

            {/* Status pills */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {job.milestones.map((m, i) => {
                const st = MILESTONE_STATUS[m.status] || MILESTONE_STATUS[0];
                return (
                  <span key={i} style={{ fontFamily: "var(--mono)", fontSize: 10, padding: "2px 8px",
                    borderRadius: 3, border: `1px solid ${st.color}`, color: st.color, background: st.color + "15" }}>
                    #{i+1} {m.title?.slice(0, 14)} · {st.label}
                  </span>
                );
              })}
            </div>

            <div className="card-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => toggle(job.id)}>
                {expanded[job.id] ? "▲ Hide Milestones" : "▼ View Milestones"}
              </button>
            </div>

            {expanded[job.id] && (
              <div style={{ marginTop: 12 }}>
                {job.milestones.map((m, i) => (
                  <MilestoneRow key={i} m={m} i={i} job={job} onToast={onToast} onRefresh={onRefresh} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
