import JobList   from "../components/JobList.jsx";
import CreateJob from "./CreateJob.jsx";
import { useState } from "react";

const TABS = ["All Jobs", "My Jobs (Client)", "My Jobs (Freelancer)", "+ Create Job"];

export default function Dashboard({ jobs, account, onRefresh, onToast }) {
  const [tab, setTab] = useState(0);

  const counts = {
    open:      jobs.filter(j => j.status === 0).length,
    submitted: jobs.filter(j => j.status === 1).length,
    disputed:  jobs.filter(j => j.status === 2).length,
    completed: jobs.filter(j => j.status === 3).length,
  };

  const filters = [
    null,
    j => j.client?.toLowerCase()     === account?.toLowerCase(),
    j => j.freelancer?.toLowerCase() === account?.toLowerCase(),
  ];

  return (
    <div>
      {/* ── Stats bar ── */}
      <div className="stats-bar">
        <div className="stat">
          <div className="stat-val" style={{ color:"var(--warn)" }}>{counts.open}</div>
          <div className="stat-label">Open</div>
        </div>
        <div className="stat">
          <div className="stat-val" style={{ color:"var(--accent2)" }}>{counts.submitted}</div>
          <div className="stat-label">Pending Review</div>
        </div>
        <div className="stat">
          <div className="stat-val" style={{ color:"#f97316" }}>{counts.disputed}</div>
          <div className="stat-label">Disputed</div>
        </div>
        <div className="stat">
          <div className="stat-val" style={{ color:"var(--accent)" }}>{counts.completed}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat">
          <div className="stat-val">{jobs.length}</div>
          <div className="stat-label">Total</div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="tabs">
        {TABS.map((t, i) => (
          <button key={t} className={`tab-btn ${tab === i ? "active" : ""}`}
            onClick={() => setTab(i)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 3 ? (
        <CreateJob account={account} onToast={onToast}
          onJobCreated={() => { onRefresh(); setTab(0); }} />
      ) : (
        <>
          <div className="section-head">
            <span className="section-title">
              {tab === 0 ? "All Jobs" : tab === 1 ? "Jobs You Posted" : "Assigned to You"}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={onRefresh}>↻ Refresh</button>
          </div>
          <JobList jobs={jobs} account={account}
            onRefresh={onRefresh} onToast={onToast} filter={filters[tab]} />
        </>
      )}
    </div>
  );
}
