import JobCard from "./JobCard.jsx";

export default function JobList({ jobs, account, onRefresh, onToast, filter }) {
  const filtered = filter ? jobs.filter(filter) : jobs;

  if (!filtered.length) {
    return (
      <div className="empty">
        <em>📭</em>
        No jobs to display yet.
      </div>
    );
  }

  return (
    <div className="job-grid">
      {filtered.map(job => (
        <JobCard
          key={job.id}
          job={job}
          account={account}
          onRefresh={onRefresh}
          onToast={onToast}
        />
      ))}
    </div>
  );
}
