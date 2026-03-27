import { useState } from "react";
import {
  STATUS_LABELS, STATUS_COLORS,
  submitWork, approvePayment, resolveAfterDeadline, assignFreelancer,
} from "../services/blockchain.js";
import DisputePanel    from "./DisputePanel.jsx";
import ReputationCard  from "./ReputationCard.jsx";

export default function JobCard({ job, account, onRefresh, onToast }) {
  const [busy,       setBusy]       = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submission, setSubmission] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [assignAddr, setAssignAddr] = useState("");
  const [showRep,    setShowRep]    = useState(false);

  const isClient     = account?.toLowerCase() === job.client?.toLowerCase();
  const isFreelancer = account?.toLowerCase() === job.freelancer?.toLowerCase();
  const isPastDeadline = Date.now() > job.deadline;
  const noFreelancer = !job.freelancer ||
    job.freelancer === "0x0000000000000000000000000000000000000000";

  async function run(fn, msg) {
    setBusy(true);
    try {
      await fn();
      onToast(msg, "success");
      onRefresh();
    } catch (e) {
      onToast(e.reason || e.message || "Transaction failed", "error");
    } finally { setBusy(false); }
  }

  async function handleSubmitWork() {
    if (!submission.trim()) return onToast("Enter a submission link/hash", "error");
    await run(() => submitWork(job.id, submission.trim()), "Work submitted on-chain!");
    setShowSubmit(false); setSubmission("");
  }

  async function handleAssign() {
    if (!assignAddr.trim()) return onToast("Enter freelancer address", "error");
    await run(() => assignFreelancer(job.id, assignAddr.trim()), "Freelancer assigned!");
    setShowAssign(false);
  }

  const statusColor = STATUS_COLORS[job.status] || "#888";

  return (
    <div className="card">
      {/* ── Header ── */}
      <div className="card-header">
        <div>
          <div className="card-title">{job.title}</div>
          <div style={{ marginTop: 4 }}>
            <span className="badge" style={{ color: statusColor, borderColor: statusColor,
              background: statusColor + "15" }}>
              {STATUS_LABELS[job.status]}
            </span>
          </div>
        </div>
        <span style={{ fontFamily:"var(--mono)", fontSize:16, fontWeight:700,
                       color:"var(--accent)" }}>
          {job.payment} ETH
        </span>
      </div>

      <p className="card-desc">{job.description}</p>

      <div className="card-meta">
        <span>Job&nbsp;#<span className="val">{job.id}</span></span>
        <span>Deadline&nbsp;<span className="val">
          {new Date(job.deadline).toLocaleDateString()}
        </span></span>
        <span>Client&nbsp;<span className="val">{job.client.slice(0,8)}…</span></span>
        {!noFreelancer && (
          <span>Freelancer&nbsp;<span className="val">{job.freelancer.slice(0,8)}…</span></span>
        )}
      </div>

      {job.workSubmission && (
        <div className="submission-preview">↳ {job.workSubmission}</div>
      )}

      {/* ── Inline submit work ── */}
      {showSubmit && (
        <div className="inline-form">
          <input value={submission} onChange={e => setSubmission(e.target.value)}
            placeholder="IPFS hash or deliverable URL…" />
          <button className="btn btn-primary btn-sm" onClick={handleSubmitWork} disabled={busy}>
            {busy ? <span className="spinner" /> : "Send"}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowSubmit(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* ── Inline assign ── */}
      {showAssign && (
        <div className="inline-form">
          <input value={assignAddr} onChange={e => setAssignAddr(e.target.value)}
            placeholder="0x… freelancer address" />
          <button className="btn btn-primary btn-sm" onClick={handleAssign} disabled={busy}>
            {busy ? <span className="spinner" /> : "Assign"}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAssign(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* ── Dispute panel (raise / resolve) ── */}
      <DisputePanel job={job} account={account} onRefresh={onRefresh} onToast={onToast} />

      {/* ── Primary actions ── */}
      <div className="card-actions">
        {isClient && job.status === 0 && noFreelancer && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAssign(v => !v)}>
            Assign Freelancer
          </button>
        )}
        {isFreelancer && job.status === 0 && !isPastDeadline && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowSubmit(v => !v)}>
            Submit Work
          </button>
        )}
        {isClient && job.status === 1 && (
          <button className="btn btn-primary btn-sm"
            onClick={() => run(() => approvePayment(job.id),
              "Payment approved! 🎉 Freelancer earns 10 WORK tokens.")}
            disabled={busy}>
            {busy ? <span className="spinner" /> : "✓ Approve & Pay"}
          </button>
        )}
        {isPastDeadline && (job.status === 0 || job.status === 1) &&
          (isClient || isFreelancer) && (
          <button className="btn btn-danger btn-sm"
            onClick={() => run(() => resolveAfterDeadline(job.id), "Resolved after deadline.")}
            disabled={busy}>
            {busy ? <span className="spinner" /> : "Resolve (Deadline)"}
          </button>
        )}

        {/* Reputation toggle — shown once job is done */}
        {(job.status === 3 || job.status === 4) && (
          <button className="btn btn-secondary btn-sm"
            onClick={() => setShowRep(v => !v)}>
            {showRep ? "Hide" : "View Reputation"}
          </button>
        )}
      </div>

      {/* ── Reputation cards ── */}
      {showRep && (
        <div style={{ marginTop: 8, display:"flex", flexDirection:"column", gap: 8 }}>
          <ReputationCard address={job.freelancer} label="Freelancer Rep"
            onToast={onToast} />
          <ReputationCard address={job.client} label="Client Rep"
            onToast={onToast} />
        </div>
      )}
    </div>
  );
}
