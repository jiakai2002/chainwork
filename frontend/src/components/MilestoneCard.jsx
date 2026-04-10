import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useTransaction } from "../hooks/useTransaction.js";
import {
  MILESTONE_STATUS,
  tx_submitWork, tx_approveMilestone, tx_rejectMilestone,
  tx_raiseDispute, tx_rateFreelancer,
  uploadToIPFS, ipfsUrl, signMessage, fromOctas,
} from "../services/aptos.js";

export default function MilestoneCard({ milestone, jobId, jobClientAddr, freelancerAddr, index, onToast, onRefresh }) {
  const { account, signMessage: walletSignMessage } = useWallet();
  const addr = account?.address ? account.address.toString() : null;

  const isClient     = addr === jobClientAddr;
  const isFreelancer = addr === freelancerAddr;
  // Moderator: either assigned address, OR client acting as moderator (admin fallback)
  const isMod = addr === milestone.moderator || isClient;

  const { run, busy } = useTransaction(onToast, onRefresh);

  const [showSubmit,  setShowSubmit]  = useState(false);
  const [showVerdict, setShowVerdict] = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [verdictNote, setVerdictNote] = useState("");
  const [rating,      setRating]      = useState(0);

  const status = milestone.status;
  const st     = MILESTONE_STATUS[status] || MILESTONE_STATUS[0];
  const isPast = Date.now() / 1000 > milestone.deadline_secs;

  // ── Submit work: upload to IPFS → sign hash → on-chain ────────────────────
  async function handleSubmit(file) {
    setSubmitting(true);
    try {
      const cid = await uploadToIPFS(file);
      const sig = await signMessage(cid, walletSignMessage);
      await run(
        tx_submitWork({ jobId: jobId, milestoneIndex: index, ipfsHash: cid, sig }),
        "Work submitted & signed on-chain!"
      );
    } catch (e) {
      onToast(e.message || "Submission failed", "error");
    } finally {
      setSubmitting(false); setShowSubmit(false);
    }
  }

  // ── Moderator verdict: upload report to IPFS → on-chain ───────────────────
  async function handleVerdict(approve) {
    const cid = await uploadToIPFS(new Blob([verdictNote], { type: "text/plain" }));
    const tx  = approve
      ? tx_approveMilestone({ clientAddr: jobClientAddr, milestoneIndex: index, verdictIpfs: cid })
      : tx_rejectMilestone({ clientAddr: jobClientAddr, milestoneIndex: index, verdictIpfs: cid });
    await run(tx, approve ? "Milestone approved — payment released!" : "Milestone rejected — freelancer notified.");
    setShowVerdict(false);
  }

  return (
    <div className="milestone-card">
      <div className="milestone-header">
        <span className="milestone-title">
          #{index + 1} — {milestone.title}
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--green)" }}>
            {fromOctas(milestone.amount_apt).toFixed(2)} APT
          </span>
          <span className="badge" style={{ color: st.color, borderColor: st.color, background: st.color + "18" }}>
            {st.label}
          </span>
        </div>
      </div>

      <div className="milestone-body">{milestone.description}</div>

      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
        Deadline: {new Date(milestone.deadline_secs * 1000).toLocaleDateString()}
        {milestone.moderator && milestone.moderator !== "0x0" && (
          <span style={{ marginLeft: 12 }}>
            Moderator: {milestone.moderator.slice(0, 8)}…
          </span>
        )}
        {milestone.revision_count > 0 && (
          <span style={{ marginLeft: 12, color: "var(--orange)" }}>
            Revisions: {milestone.revision_count}/3
          </span>
        )}
      </div>

      {/* IPFS submission link */}
      {milestone.ipfs_hash && (
        <div className="ipfs-hash">
          ↳ Work: <a href={ipfsUrl(milestone.ipfs_hash)} target="_blank" rel="noreferrer">
            {milestone.ipfs_hash}
          </a>
          {milestone.submission_sig && (
            <span style={{ marginLeft: 8, color: "var(--green)" }}>✓ Signed</span>
          )}
        </div>
      )}

      {/* Verdict IPFS link */}
      {milestone.verdict && (
        <div className="ipfs-hash" style={{ borderColor: "var(--purple)" }}>
          ↳ Verdict: <a href={ipfsUrl(milestone.verdict)} target="_blank" rel="noreferrer">
            {milestone.verdict}
          </a>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="card-actions">

        {/* Freelancer: submit work */}
        {isFreelancer && (status === 0 || status === 3) && !isPast && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowSubmit(v => !v)}>
              {status === 3 ? "Resubmit Work" : "Submit Work"}
            </button>
            {showSubmit && (
              <div style={{ width: "100%", marginTop: 8 }}>
                <input
                  type="file"
                  onChange={e => e.target.files[0] && handleSubmit(e.target.files[0])}
                  style={{ color: "var(--text)", fontSize: 12, fontFamily: "var(--mono)" }}
                />
                {submitting && <span className="spinner" style={{ marginLeft: 8 }} />}
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  File is uploaded to IPFS and its hash is signed with your wallet key.
                </div>
              </div>
            )}
          </>
        )}

        {/* Moderator: approve / reject */}
        {isMod && status === 1 && (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => setShowVerdict(v => !v)}>
              Submit Verdict
            </button>
            {showVerdict && (
              <div style={{ width: "100%", marginTop: 8 }}>
                <textarea
                  className="form-group"
                  style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, padding: "8px 10px", fontFamily: "var(--sans)", fontSize: 12, minHeight: 60 }}
                  placeholder="Write your assessment notes (stored on IPFS)…"
                  value={verdictNote}
                  onChange={e => setVerdictNote(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => handleVerdict(true)} disabled={busy}>
                    {busy ? <span className="spinner" /> : "✓ Approve"}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleVerdict(false)} disabled={busy}>
                    {busy ? <span className="spinner" /> : "✗ Reject"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Either party: dispute */}
        {(isClient || isFreelancer) && (status === 1 || status === 3) && (
          <button className="btn btn-danger btn-sm"
            onClick={() => run(tx_raiseDispute({ jobId: jobId, milestoneIndex: index }), "Dispute raised — panel assigned.")}
            disabled={busy}>
            {busy ? <span className="spinner" /> : "⚠ Raise Dispute"}
          </button>
        )}

        {/* Client: rate after approval */}
        {isClient && status === 2 && rating === 0 && (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>Rate:</span>
            {[1, 2, 3, 4, 5].map(s => (
              <button key={s} onClick={() => { setRating(s); run(tx_rateFreelancer({ jobId: jobId, milestoneIndex: index, stars: s }), `Rated ${s}★`); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18,
                  color: s <= rating ? "var(--gold)" : "var(--border)" }}>
                ★
              </button>
            ))}
          </div>
        )}
        {rating > 0 && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--gold)" }}>
            ★ {rating} rated
          </span>
        )}
      </div>
    </div>
  );
}
