import { useState } from "react";
import { raiseDispute, resolveDispute } from "../services/blockchain.js";

/**
 * DisputePanel
 * Shown on a JobCard when status === WorkSubmitted (raise) or Disputed (resolve).
 */
export default function DisputePanel({ job, account, onRefresh, onToast }) {
  const [busy,       setBusy]       = useState(false);
  const [showSplit,  setShowSplit]  = useState(false);
  const [clientPct,  setClientPct] = useState("50");

  const isClient     = account?.toLowerCase() === job.client?.toLowerCase();
  const isFreelancer = account?.toLowerCase() === job.freelancer?.toLowerCase();
  const isArbitrator = account?.toLowerCase() === job.arbitrator?.toLowerCase();

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

  async function handleResolve() {
    const pct = parseInt(clientPct, 10);
    if (isNaN(pct) || pct < 0 || pct > 100)
      return onToast("Enter 0–100 for client %", "error");
    await run(
      () => resolveDispute(job.id, pct * 100),   // pct → basis points
      `Dispute resolved: client ${pct}% / freelancer ${100 - pct}%`
    );
    setShowSplit(false);
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* ── Raise dispute (either party, after work submitted) ── */}
      {job.status === 1 && (isClient || isFreelancer) && (
        <button
          className="btn btn-danger btn-sm"
          onClick={() => run(() => raiseDispute(job.id), "Dispute raised — arbitrator notified.")}
          disabled={busy}
        >
          {busy ? <span className="spinner" /> : "⚠ Raise Dispute"}
        </button>
      )}

      {/* ── Arbitrator resolve ── */}
      {job.status === 2 && isArbitrator && (
        <>
          <div style={{
            padding: "8px 12px", marginBottom: 8,
            background: "rgba(249,115,22,0.08)",
            border: "1px solid #f97316",
            borderRadius: 6,
            fontFamily: "var(--mono)", fontSize: 11,
            color: "#f97316"
          }}>
            ⚖ Dispute in progress — you are the arbitrator
          </div>

          {!showSplit ? (
            <button className="btn btn-sm" style={{ borderColor:"#f97316", color:"#f97316" }}
              onClick={() => setShowSplit(true)}>
              Resolve Dispute
            </button>
          ) : (
            <div className="inline-form" style={{ flexWrap:"wrap", gap: 8 }}>
              <label style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)", alignSelf:"center" }}>
                Client %
              </label>
              <input
                type="number" min="0" max="100"
                value={clientPct}
                onChange={e => setClientPct(e.target.value)}
                style={{ width: 70 }}
              />
              <span style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)", alignSelf:"center" }}>
                → Freelancer {100 - (parseInt(clientPct)||0)}%
              </span>
              <button className="btn btn-primary btn-sm" onClick={handleResolve} disabled={busy}>
                {busy ? <span className="spinner" /> : "Confirm Split"}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowSplit(false)}>
                Cancel
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Dispute notice for parties ── */}
      {job.status === 2 && !isArbitrator && (isClient || isFreelancer) && (
        <div style={{
          padding: "8px 12px",
          background: "rgba(249,115,22,0.08)",
          border: "1px solid #f97316",
          borderRadius: 6,
          fontFamily: "var(--mono)", fontSize: 11,
          color: "#f97316"
        }}>
          ⚖ Under arbitration — waiting for arbitrator to resolve
        </div>
      )}
    </div>
  );
}
