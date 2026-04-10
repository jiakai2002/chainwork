import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useTransaction } from "../hooks/useTransaction.js";
import {
  fromOctas, MILESTONE_STATUS, tx_submitWork, tx_raiseDispute,
  uploadToIPFS, ipfsUrl, signMessage,
} from "../services/aptos.js";

function MilestoneRow({ m, i, job, onToast, onRefresh }) {
  const { signMessage: walletSign } = useWallet();
  const { run, busy } = useTransaction(onToast, onRefresh);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const st = MILESTONE_STATUS[m.status] || MILESTONE_STATUS[0];
  const isPast = Date.now() / 1000 > m.deadline_secs;

  async function handleSubmit(file) {
    setSubmitting(true);
    try {
      const cid = await uploadToIPFS(file);
      const sig = await signMessage(cid, walletSign);
      await run(
        tx_submitWork({ jobId: job.id, milestoneIndex: i, ipfsHash: cid, sig }),
        "Work submitted & signed on-chain!"
      );
      setShowSubmit(false);
    } catch (e) {
      onToast(e.message || "Submission failed", "error");
    } finally {
      setSubmitting(false);
    }
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
        {isPast && <span style={{ color: "var(--red)", marginLeft: 8 }}>⚠ Deadline passed</span>}
        {m.revision_count > 0 && (
          <span style={{ marginLeft: 12, color: "var(--orange)" }}>Revisions: {m.revision_count}/3</span>
        )}
      </div>

      {m.ipfs_hash && (
        <div className="ipfs-hash">
          ↳ Work: <a href={ipfsUrl(m.ipfs_hash)} target="_blank" rel="noreferrer">{m.ipfs_hash}</a>
          {m.submission_sig && <span style={{ marginLeft: 8, color: "var(--green)" }}>✓ Signed</span>}
        </div>
      )}

      {m.verdict && (
        <div className="ipfs-hash" style={{ borderColor: "var(--purple)" }}>
          ↳ Verdict: <a href={ipfsUrl(m.verdict)} target="_blank" rel="noreferrer">{m.verdict}</a>
        </div>
      )}

      <div className="card-actions">
        {/* Submit / resubmit */}
        {(m.status === 0 || m.status === 3) && !isPast && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowSubmit(v => !v)}>
              {m.status === 3 ? "Resubmit Work" : "Submit Work"}
            </button>
            {showSubmit && (
              <div style={{ width: "100%", marginTop: 8 }}>
                <input type="file"
                  onChange={e => e.target.files[0] && handleSubmit(e.target.files[0])}
                  style={{ color: "var(--text)", fontSize: 12, fontFamily: "var(--mono)" }}
                />
                {submitting && <span className="spinner" style={{ marginLeft: 8 }} />}
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  File is uploaded to IPFS and its hash is signed with your wallet — cryptographic proof of authorship.
                </div>
              </div>
            )}
          </>
        )}

        {/* Escalate to dispute if rejected and freelancer disagrees */}
        {m.status === 3 && (
          <button className="btn btn-danger btn-sm"
            onClick={() => run(tx_raiseDispute({ jobId: job.id, milestoneIndex: i }), "Dispute raised!")}
            disabled={busy}>
            ⚠ Dispute Rejection
          </button>
        )}

        {m.status === 1 && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--blue)" }}>
            ⏳ Awaiting client review
          </span>
        )}
        {m.status === 2 && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--green)" }}>
            ✓ Approved — payment released
          </span>
        )}
        {m.status === 4 && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--red)" }}>
            ⚠ In dispute
          </span>
        )}
      </div>
    </div>
  );
}

export default function FreelancerJobs({ jobs, account, onToast, onRefresh }) {
  const addr = account?.address?.toString();
  const [expanded, setExpanded] = useState({});

  const myJobs = jobs.filter(j => j.freelancer === addr);
  const toggle = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  if (myJobs.length === 0) {
    return (
      <div className="empty">
        <em>💼</em>
        No jobs assigned to you yet.
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
                  <span>Client <span className="val">{job.client?.slice(0,8)}…</span></span>
                  <span>Progress <span className="val">{completedCount}/{job.milestones.length}</span></span>
                </div>
                {job.description && <p className="card-desc">{job.description}</p>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color: "var(--green)" }}>
                  {fromOctas(totalApt).toFixed(2)} APT
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>total earnings</div>
              </div>
            </div>

            <div style={{ background: "var(--border)", borderRadius: 4, height: 4, margin: "8px 0", overflow: "hidden" }}>
              <div style={{ width: `${job.milestones.length > 0 ? (completedCount / job.milestones.length) * 100 : 0}%`,
                height: "100%", background: "var(--green)", borderRadius: 4 }} />
            </div>

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
