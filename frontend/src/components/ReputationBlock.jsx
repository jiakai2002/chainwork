import { useEffect, useState } from "react";
import { getFreelancerScore, getCompletionRate, TIER_LABELS, TIER_COLORS } from "../services/aptos.js";

function Stars({ value }) {
  return (
    <span>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= Math.round(value) ? "var(--gold)" : "var(--border)", fontSize: 14 }}>★</span>
      ))}
      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>
        {value > 0 ? value.toFixed(1) : "—"}
      </span>
    </span>
  );
}

export default function ReputationBlock({ address, tier }) {
  const [score, setScore] = useState(null);
  const [rate,  setRate]  = useState(null);

  useEffect(() => {
    if (!address) return;
    getFreelancerScore(address).then(setScore);
    getCompletionRate(address).then(setRate);
  }, [address]);

  if (!score) return null;

  const tierColor = TIER_COLORS[tier ?? 0];

  return (
    <div className="rep-block">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Reputation · {address.slice(0, 8)}…
        </span>
        <span className="tier-badge" style={{ color: tierColor, borderColor: tierColor }}>
          {TIER_LABELS[tier ?? 0]}
        </span>
      </div>
      <div className="rep-grid">
        <div className="rep-item">
          <div className="rep-val" style={{ color: "var(--green)" }}>{score.completed}</div>
          <div className="rep-lbl">Completed</div>
        </div>
        <div className="rep-item">
          <div className="rep-val" style={{ color: "var(--blue)" }}>{rate ?? 0}%</div>
          <div className="rep-lbl">Success Rate</div>
        </div>
        <div className="rep-item">
          <div className="rep-val" style={{ color: "var(--orange)" }}>🔥 {score.streak}</div>
          <div className="rep-lbl">Day Streak</div>
        </div>
        <div className="rep-item">
          <Stars value={score.avgRating} />
          <div className="rep-lbl">{score.ratingCount} ratings</div>
        </div>
        <div className="rep-item">
          <div className="rep-val" style={{ color: "var(--gold)" }}>{score.lifetimeWork.toFixed(0)}</div>
          <div className="rep-lbl">WORK Earned</div>
        </div>
      </div>
    </div>
  );
}
