import { useState } from "react";
import { createJob } from "../services/blockchain.js";

export default function CreateJob({ account, onJobCreated, onToast }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    freelancer: "",
    deadlineDays: "7",
    paymentEth: "0.01",
  });
  const [busy, setBusy] = useState(false);

  function update(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!account) return onToast("Connect wallet first", "error");
    if (!form.title.trim()) return onToast("Title is required", "error");
    if (!form.paymentEth || isNaN(form.paymentEth) || Number(form.paymentEth) <= 0)
      return onToast("Enter a valid ETH payment", "error");

    setBusy(true);
    try {
      await createJob({
        title:       form.title.trim(),
        description: form.description.trim(),
        freelancer:  form.freelancer.trim(),
        deadlineDays: Number(form.deadlineDays) || 7,
        paymentEth:  form.paymentEth,
      });
      onToast("Job created & funds locked in escrow!", "success");
      setForm({ title: "", description: "", freelancer: "", deadlineDays: "7", paymentEth: "0.01" });
      onJobCreated();
    } catch (err) {
      onToast(err.reason || err.message || "Transaction failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-card">
      <div className="form-title">// Create New Job</div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Job Title *</label>
          <input
            value={form.title}
            onChange={update("title")}
            placeholder="e.g. Build a landing page"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={form.description}
            onChange={update("description")}
            placeholder="Describe the work, deliverables, expectations…"
          />
        </div>

        <div className="form-group">
          <label>Freelancer Address (optional)</label>
          <input
            value={form.freelancer}
            onChange={update("freelancer")}
            placeholder="0x… (leave blank to assign later)"
            style={{ fontFamily: "var(--mono)", fontSize: 12 }}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Payment (ETH) *</label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={form.paymentEth}
              onChange={update("paymentEth")}
            />
          </div>
          <div className="form-group">
            <label>Deadline (days) *</label>
            <input
              type="number"
              min="1"
              value={form.deadlineDays}
              onChange={update("deadlineDays")}
            />
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={busy || !account}>
            {busy ? <><span className="spinner" /> Sending tx…</> : "→ Create & Deposit"}
          </button>
        </div>

        {!account && (
          <p style={{ marginTop: 10, fontSize: 12, color: "var(--warn)", fontFamily: "var(--mono)" }}>
            ⚠ Connect your wallet first.
          </p>
        )}
      </form>
    </div>
  );
}
