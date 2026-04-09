import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useTransaction } from "../hooks/useTransaction.js";
import {
  tx_approveMilestone, tx_rejectMilestone, tx_stakeAsModerator,
  tx_voteDispute, uploadToIPFS, ipfsUrl, fromOctas, getModeratorScore,
} from "../services/aptos.js";

/**
 * ModeratorDashboard
 * Shows jobs where this wallet is the assigned moderator.
 * Moderator can: write a verdict report → upload to IPFS → approve or reject.
 * Also shows dispute panel votes if assigned as panelist.
 */
export default function ModeratorDashboard({ jobs, onToast, onRefresh }) {
  const { account } = useWallet();
  const addr = account?.address ? account.address.toString() : null;
  const { run, busy } = useTransaction(onToast, onRefresh);

  const [stakeAmt,    setStakeAmt]    = useState("500");
  const [verdicts,    setVerdicts]    = useState({}); // { "clientAddr-index": noteText }
  const [activePanel, setActivePanel] = useState(null);

  // Filter jobs/milestones where this wallet is the assigned moderator
  const myAssignments = [];
  jobs.forEach(job => {
    (job.milestones || []).forEach((m, i) => {
      if (m.moderator === addr && m.status === 1) {  // status 1 = Submitted
        myAssignments.push({ job, milestone: m, index: i });
      }
    });
  });

  // Disputed milestones where this wallet is a panelist
  const myDisputes = [];
  jobs.forEach(job => {
    (job.milestones || []).forEach((m, i) => {
      if (m.status === 4 && m.panelists?.includes(addr)) {
        myDisputes.push({ job, milestone: m, index: i });
      }
    });
  });

  function verdictKey(job, i) { return `${job.client}-${i}`; }

  async function handleVerdict(job, milestone, index, approve) {
    const key  = verdictKey(job, index);
    const note = verdicts[key] || "(No notes provided)";
    const cid  = await uploadToIPFS(new Blob([note], { type: "text/plain" }));
    const tx   = approve
      ? tx_approveMilestone({ clientAddr: job.client, milestoneIndex: index, verdictIpfs: cid })
      : tx_rejectMilestone ({ clientAddr: job.client, milestoneIndex: index, verdictIpfs: cid });
    await run(tx, approve
      ? "✓ Milestone approved — payment released to freelancer."
      : "✗ Milestone rejected — freelancer can revise and resubmit."
    );
  }

  return (
    <div>
      {/* ── Stake panel ── */}
      <div className="card" style={{ marginBottom: 20, maxWidth: 480 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--blue)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".5px" }}>
          Moderator Stake
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          Stake 500+ WORK to join the active moderator pool. Your stake is at risk
          if your verdicts are overturned by a dispute panel.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number" min="500" value={stakeAmt}
            onChange={e => setStakeAmt(e.target.value)}
            style={{ width: 120, background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: 6, color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12, padding: "6px 10px" }}
          />
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>WORK</span>
          <button className="btn btn-gold btn-sm"
            onClick={() => run(tx_stakeAsModerator({ amount: parseFloat(stakeAmt) }), `Staked ${stakeAmt} WORK!`)}
            disabled={busy}>
            {busy ? <span className="spinner" /> : "Stake"}
          </button>
        </div>
      </div>

      {/* ── Assessment queue ── */}
      <div className="section-head">
        <span className="section-title">Pending Assessments ({myAssignments.length})</span>
      </div>

      {myAssignments.length === 0 ? (
        <div className="empty">
          <em>📋</em>
          No pending assessments. You'll be notified when a freelancer submits work.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {myAssignments.map(({ job, milestone, index }) => {
            const key = verdictKey(job, index);
            return (
              <div key={key} className="card">
                {/* Job context */}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div className="card-title">{job.title}</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      Client: {job.client?.slice(0, 10)}…  ·  Milestone #{index + 1}
                    </div>
                  </div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: "var(--green)" }}>
                    {fromOctas(milestone.amount_apt).toFixed(2)} APT
                  </span>
                </div>

                {/* Milestone spec */}
                <div className="milestone-card">
                  <div className="milestone-title">{milestone.title}</div>
                  <div className="milestone-body">{milestone.description}</div>
                </div>

                {/* Freelancer's submission */}
                {milestone.ipfs_hash && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
                      SUBMITTED WORK
                    </div>
                    <div className="ipfs-hash">
                      <a href={ipfsUrl(milestone.ipfs_hash)} target="_blank" rel="noreferrer">
                        {milestone.ipfs_hash}
                      </a>
                      {milestone.submission_sig && (
                        <span style={{ marginLeft: 8, color: "var(--green)" }}>
                          ✓ Freelancer signature verified
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      Submitted: {milestone.submitted_at
                        ? new Date(milestone.submitted_at * 1000).toLocaleString()
                        : "—"}
                    </div>
                  </div>
                )}

                {/* Verdict notes */}
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
                    YOUR ASSESSMENT (stored on IPFS)
                  </div>
                  <textarea
                    value={verdicts[key] || ""}
                    onChange={e => setVerdicts(v => ({ ...v, [key]: e.target.value }))}
                    placeholder="Describe what you reviewed, whether deliverables match the milestone spec, and your decision rationale…"
                    style={{
                      width: "100%", background: "var(--surface2)", border: "1px solid var(--border)",
                      borderRadius: 6, color: "var(--text)", fontFamily: "var(--sans)", fontSize: 12,
                      padding: "8px 12px", minHeight: 80, resize: "vertical", outline: "none",
                    }}
                  />
                </div>

                <div className="card-actions">
                  <button className="btn btn-primary btn-sm"
                    onClick={() => handleVerdict(job, milestone, index, true)}
                    disabled={busy || !verdicts[key]?.trim()}>
                    {busy ? <span className="spinner" /> : "✓ Approve Milestone"}
                  </button>
                  <button className="btn btn-danger btn-sm"
                    onClick={() => handleVerdict(job, milestone, index, false)}
                    disabled={busy || !verdicts[key]?.trim()}>
                    {busy ? <span className="spinner" /> : "✗ Reject — Request Revision"}
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
        </div>
      )}

      {/* ── Dispute panels ── */}
      {myDisputes.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 32 }}>
            <span className="section-title">Dispute Panels ({myDisputes.length})</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {myDisputes.map(({ job, milestone, index }) => (
              <div key={`${job.client}-${index}`} className="card">
                <div className="card-title">{job.title} — Milestone #{index + 1}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0" }}>
                  This milestone is under dispute. Review the submission and prior
                  moderator verdict, then cast your vote.
                </div>
                {milestone.ipfs_hash && (
                  <div className="ipfs-hash">
                    Work: <a href={ipfsUrl(milestone.ipfs_hash)} target="_blank" rel="noreferrer">
                      {milestone.ipfs_hash}
                    </a>
                  </div>
                )}
                {milestone.verdict && (
                  <div className="ipfs-hash" style={{ borderColor: "var(--purple)" }}>
                    Prior verdict: <a href={ipfsUrl(milestone.verdict)} target="_blank" rel="noreferrer">
                      {milestone.verdict}
                    </a>
                  </div>
                )}
                <div className="card-actions">
                  <button className="btn btn-primary btn-sm"
                    onClick={() => run(tx_voteDispute({ panelAddr: job.client, approve: true }),
                      "Voted: release to freelancer")}
                    disabled={busy}>
                    Vote: Release to Freelancer
                  </button>
                  <button className="btn btn-danger btn-sm"
                    onClick={() => run(tx_voteDispute({ panelAddr: job.client, approve: false }),
                      "Voted: refund client")}
                    disabled={busy}>
                    Vote: Refund Client
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
