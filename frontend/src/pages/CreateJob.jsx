import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useTransaction } from "../hooks/useTransaction.js";
import { tx_createJob, tx_fundMilestone, ADMIN_ADDR, aptos, MODULE_ADDR } from "../services/aptos.js";

const defaultMilestone = () => ({
  title: "", desc: "", amountApt: "0.1", deadlineDays: "7"
});

export default function CreateJob({ onToast, onCreated }) {
  const { account } = useWallet();
  const { run, busy } = useTransaction(onToast, onCreated);

  const [form, setForm] = useState({
    freelancer:  "",
    title:       "",
    description: "",
  });
  const [milestones, setMilestones] = useState([defaultMilestone()]);

  function updateForm(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })); }

  function updateMilestone(i, k) {
    return e => setMilestones(ms => {
      const copy = [...ms];
      copy[i] = { ...copy[i], [k]: e.target.value };
      return copy;
    });
  }

  function addMilestone() {
    setMilestones(ms => [...ms, defaultMilestone()]);
  }

  function removeMilestone(i) {
    setMilestones(ms => ms.filter((_, j) => j !== i));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!account) return onToast("Connect wallet first", "error");
    if (!form.title.trim())      return onToast("Title required", "error");
    if (!form.freelancer.trim()) return onToast("Freelancer address required", "error");
    const freelancerAddr = form.freelancer.trim().startsWith("0x")
      ? form.freelancer.trim()
      : `0x${form.freelancer.trim()}`;
    if (milestones.some(m => !m.title.trim())) return onToast("All milestones need a title", "error");

    const nowSecs = Math.floor(Date.now() / 1000);
    const payload = tx_createJob({
      freelancer:          freelancerAddr,
      title:               form.title.trim(),
      description:         form.description.trim(),
      milestoneTitles:     milestones.map(m => m.title.trim()),
      milestoneDescs:      milestones.map(m => m.desc.trim()),
      milestoneAmountsApt: milestones.map(m => parseFloat(m.amountApt) || 0.1),
      milestoneDeadlinesSecs: milestones.map(m =>
        nowSecs + (parseInt(m.deadlineDays) || 7) * 86400
      ),
    });

    // Step 1: create job
    await run(payload, `Job created! Now funding ${milestones.length} milestone(s)…`);

    // Step 2: get the new job ID (next_id - 1)
    try {
      const store = await aptos.getAccountResource({
        accountAddress: ADMIN_ADDR,
        resourceType: `${MODULE_ADDR}::job_escrow::JobStore`,
      });
      const jobId = Number(store.next_id) - 1;

      // Step 3: fund each milestone
      for (let i = 0; i < milestones.length; i++) {
        await run(
          tx_fundMilestone({ jobId, milestoneIndex: i }),
          `Milestone #${i + 1} funded — ${milestones[i].amountApt} APT locked in escrow.`
        );
      }
    } catch (e) {
      onToast("Job created but auto-fund failed. Fund milestones manually from Dashboard.", "error");
    }

    setForm({ freelancer: "", title: "", description: "" });
    setMilestones([defaultMilestone()]);
  }

  return (
    <div className="form-card">
      <div className="form-title">// Create New Job</div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Job Title *</label>
          <input value={form.title} onChange={updateForm("title")} placeholder="e.g. Build a DeFi dashboard" />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea value={form.description} onChange={updateForm("description")}
            placeholder="Describe deliverables, tech stack, expectations…" />
        </div>
        <div className="form-group">
          <label>Freelancer Address *</label>
          <input value={form.freelancer} onChange={updateForm("freelancer")}
            placeholder="0x…" style={{ fontFamily: "var(--mono)", fontSize: 12 }} />
        </div>

        {/* ── Milestones ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>
              Milestones ({milestones.length})
            </label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addMilestone}>
              + Add Milestone
            </button>
          </div>

          {milestones.map((m, i) => (
            <div key={i} className="milestone-builder">
              <div className="milestone-builder-header">
                <span>Milestone {i + 1}</span>
                {milestones.length > 1 && (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeMilestone(i)}>
                    Remove
                  </button>
                )}
              </div>
              <div className="form-group">
                <label>Title *</label>
                <input value={m.title} onChange={updateMilestone(i, "title")}
                  placeholder="e.g. UI wireframes" />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={m.desc} onChange={updateMilestone(i, "desc")}
                  placeholder="What must be delivered for this milestone?" style={{ minHeight: 48 }} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Payment (APT) *</label>
                  <input type="number" step="0.01" min="0.01"
                    value={m.amountApt} onChange={updateMilestone(i, "amountApt")} />
                </div>
                <div className="form-group">
                  <label>Deadline (days) *</label>
                  <input type="number" min="1" value={m.deadlineDays}
                    onChange={updateMilestone(i, "deadlineDays")} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="submit" className="btn btn-primary" disabled={busy || !account}>
            {busy ? <><span className="spinner" /> Creating…</> : "→ Create Job"}
          </button>
          {!account && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--gold)" }}>
              ⚠ Connect wallet first
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
