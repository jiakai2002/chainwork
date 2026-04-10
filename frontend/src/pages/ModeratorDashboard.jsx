import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useTransaction } from "../hooks/useTransaction.js";
import {
  tx_approveMilestone, tx_rejectMilestone, tx_resolveDispute, tx_stakeAsModerator,
  uploadToIPFS, ipfsUrl, fromOctas, ADMIN_ADDR,
} from "../services/aptos.js";

export default function ModeratorDashboard({ jobs, onToast, onRefresh }) {
  const { account } = useWallet();
  const addr = account?.address ? account.address.toString() : null;
  const { run, busy } = useTransaction(onToast, onRefresh);
  const [stakeAmt, setStakeAmt] = useState("500");
  const [verdicts, setVerdicts] = useState({});

  const normalize  = (a) => (a || "").replace("0x", "").toLowerCase().padStart(64, "0");
  const isAdmin    = addr ? normalize(addr) === normalize(ADMIN_ADDR) : false;

  // Milestones assigned to this moderator (Submitted or Disputed)
  const myAssignments = [];
  jobs.forEach(job => {
    (job.milestones || []).forEach((m, i) => {
      const isAssigned = !m.moderator
        || m.moderator === "0x0000000000000000000000000000000000000000000000000000000000000000"
        || m.moderator === addr;
      if (isAssigned && (m.status === 1 || m.status === 4)) {
        myAssignments.push({ job, milestone: m, index: i });
      }
    });
  });

  const myDisputes = myAssignments.filter(({ milestone: m }) => m.status === 4);
  const pendingReview = myAssignments.filter(({ milestone: m }) => m.status === 1);

  function verdictKey(job, i) { return `${job.client}-${i}`; }

  async function handleVerdict(job, milestone, index, approve) {
    const key  = verdictKey(job, index);
    const note = verdicts[key] || "(No notes provided)";
    const cid  = await uploadToIPFS(new Blob([note], { type: "text/plain" }));
    const tx   = approve
      ? tx_approveMilestone({ jobId: job.id, milestoneIndex: index, verdictIpfs: cid })
      : tx_rejectMilestone({ jobId: job.id, milestoneIndex: index, verdictIpfs: cid });
    await run(tx, approve
      ? "✓ Milestone approved — payment released to freelancer."
      : "✗ Milestone rejected — freelancer can revise and resubmit."
    );
  }

  return (
    <div>

      {/* ── Stake panel — for non-admin only ── */}
      {!isAdmin && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 520 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--blue)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".5px" }}>
            Become a Moderator
          </div>
          <div style={{ marginBottom: 14 }}>
            {[
              { label: "1. Earn Gold tier", desc: "Complete jobs as a freelancer to earn 2,000 WORK tokens" },
              { label: "2. Pass calibration", desc: "Admin reviews your track record and marks you as calibrated" },
              { label: "3. Stake 500 WORK", desc: "Collateral at risk if your verdicts are overturned by a panel" },
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", minWidth: 16 }}>○</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number" min="500" value={stakeAmt}
              onChange={e => setStakeAmt(e.target.value)}
              style={{ width: 100, background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: 6, color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12, padding: "6px 10px" }}
            />
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>WORK</span>
            <button className="btn btn-gold btn-sm"
              onClick={() => run(tx_stakeAsModerator({ amount: parseFloat(stakeAmt) }), `Staked ${stakeAmt} WORK!`)}
              disabled={busy}>
              {busy ? <span className="spinner" /> : "Stake"}
            </button>
          </div>
        </div>
      )}

      {/* ── Assessment queue — admin only ── */}
      {isAdmin && (
        <div>
          <div className="section-head">
            <span className="section-title">
              Pending Review ({pendingReview.length}) · Disputes ({myDisputes.length})
            </span>
          </div>

          {myAssignments.length === 0 ? (
            <div className="empty">
              <em>📋</em>
              No pending assessments. Waiting for freelancer to submit work.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Submitted milestones awaiting verdict */}
              {pendingReview.map(({ job, milestone, index }) => {
                const key = verdictKey(job, index);
                return (
                  <div key={key} className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <div>
                        <div className="card-title">{job.title}</div>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                          Milestone #{index + 1} · {milestone.title}
                        </div>
                      </div>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: "var(--green)" }}>
                        {fromOctas(milestone.amount_apt).toFixed(2)} APT
                      </span>
                    </div>

                    {milestone.ipfs_hash && (
                      <div className="ipfs-hash">
                        Work: <a href={ipfsUrl(milestone.ipfs_hash)} target="_blank" rel="noreferrer">
                          {milestone.ipfs_hash}
                        </a>
                        {milestone.submission_sig && (
                          <span style={{ marginLeft: 8, color: "var(--green)" }}>✓ Signed</span>
                        )}
                      </div>
                    )}

                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
                        YOUR ASSESSMENT (stored on IPFS)
                      </div>
                      <textarea
                        value={verdicts[key] || ""}
                        onChange={e => setVerdicts(v => ({ ...v, [key]: e.target.value }))}
                        placeholder="Describe your review of the deliverable…"
                        style={{
                          width: "100%", background: "var(--surface2)", border: "1px solid var(--border)",
                          borderRadius: 6, color: "var(--text)", fontFamily: "var(--sans)", fontSize: 12,
                          padding: "8px 12px", minHeight: 72, resize: "vertical", outline: "none",
                        }}
                      />
                    </div>

                    <div className="card-actions">
                      <button className="btn btn-primary btn-sm"
                        onClick={() => handleVerdict(job, milestone, index, true)}
                        disabled={busy || !verdicts[key]?.trim()}>
                        {busy ? <span className="spinner" /> : "✓ Approve"}
                      </button>
                      <button className="btn btn-danger btn-sm"
                        onClick={() => handleVerdict(job, milestone, index, false)}
                        disabled={busy || !verdicts[key]?.trim()}>
                        {busy ? <span className="spinner" /> : "✗ Reject"}
                      </button>
                      {!verdicts[key]?.trim() && (
                        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)", alignSelf: "center" }}>
                          Write assessment notes first
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Disputed milestones */}
              {myDisputes.map(({ job, milestone, index }) => (
                <div key={`dispute-${job.client}-${index}`} className="card" style={{ borderColor: "var(--orange)" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--orange)", marginBottom: 8 }}>
                    ⚠ DISPUTED
                  </div>
                  <div className="card-title">{job.title} — Milestone #{index + 1}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0" }}>
                    Review the submission and resolve the dispute.
                  </div>
                  {milestone.ipfs_hash && (
                    <div className="ipfs-hash">
                      Work: <a href={ipfsUrl(milestone.ipfs_hash)} target="_blank" rel="noreferrer">
                        {milestone.ipfs_hash}
                      </a>
                    </div>
                  )}
                  <div className="card-actions">
                    <button className="btn btn-primary btn-sm"
                      onClick={() => run(
                        tx_resolveDispute({ jobId: job.id, milestoneIndex: index, releaseToFreelancer: true }),
                        "Dispute resolved — payment released to freelancer!"
                      )}
                      disabled={busy}>
                      ✓ Release to Freelancer
                    </button>
                    <button className="btn btn-danger btn-sm"
                      onClick={() => run(
                        tx_resolveDispute({ jobId: job.id, milestoneIndex: index, releaseToFreelancer: false }),
                        "Dispute resolved — funds refunded to client!"
                      )}
                      disabled={busy}>
                      ✗ Refund Client
                    </button>
                  </div>
                </div>
              ))}

            </div>
          )}
        </div>
      )}

    </div>
  );
}
