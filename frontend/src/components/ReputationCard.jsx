import { useState, useEffect } from "react";
import { getReputation, rateUser } from "../services/blockchain.js";

function Stars({ value }) {
  return (
    <span style={{ letterSpacing: 2 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= Math.round(value) ? "#f59e0b" : "var(--border)" }}>
          ★
        </span>
      ))}
      <span style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)", marginLeft:6 }}>
        {value > 0 ? value.toFixed(1) : "—"}
      </span>
    </span>
  );
}

export default function ReputationCard({ address, label, onToast }) {
  const [rep,    setRep]    = useState(null);
  const [busy,   setBusy]   = useState(false);
  const [hovered, setHover] = useState(0);
  const [rated,   setRated] = useState(false);

  useEffect(() => {
    if (!address || address === "0x0000000000000000000000000000000000000000") return;
    getReputation(address).then(setRep).catch(() => {});
  }, [address]);

  async function handleRate(stars) {
    if (rated) return;
    setBusy(true);
    try {
      await rateUser(address, stars);
      setRated(true);
      const updated = await getReputation(address);
      setRep(updated);
      onToast?.(`Rated ${stars}★`, "success");
    } catch (e) {
      onToast?.(e.reason || e.message, "error");
    } finally { setBusy(false); }
  }

  if (!rep) return null;

  const noJobs = rep.jobsCompleted + rep.jobsDisputed + rep.jobsRefunded === 0;

  return (
    <div style={{
      background: "var(--surface2)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "12px 14px",
      marginTop: 10,
    }}>
      <div style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)",
                    marginBottom: 8, textTransform:"uppercase", letterSpacing:"0.5px" }}>
        {label || "Reputation"} · {address.slice(0,8)}…
      </div>

      {noJobs ? (
        <div style={{ fontSize:12, color:"var(--muted)" }}>No completed jobs yet</div>
      ) : (
        <div style={{ display:"flex", gap:20, flexWrap:"wrap", fontSize:12 }}>
          <div>
            <div style={{ fontFamily:"var(--mono)", fontSize:18, fontWeight:700,
                          color:"var(--accent)", lineHeight:1 }}>
              {rep.completionRate}%
            </div>
            <div style={{ color:"var(--muted)", fontSize:10, marginTop:2 }}>Completion</div>
          </div>
          <div>
            <div style={{ fontFamily:"var(--mono)", fontSize:18, fontWeight:700, lineHeight:1 }}>
              {rep.jobsCompleted}
            </div>
            <div style={{ color:"var(--muted)", fontSize:10, marginTop:2 }}>Jobs done</div>
          </div>
          {rep.jobsDisputed > 0 && (
            <div>
              <div style={{ fontFamily:"var(--mono)", fontSize:18, fontWeight:700,
                            color:"var(--warn)", lineHeight:1 }}>
                {rep.jobsDisputed}
              </div>
              <div style={{ color:"var(--muted)", fontSize:10, marginTop:2 }}>Disputed</div>
            </div>
          )}
          <div>
            <Stars value={rep.avgRating} />
            <div style={{ color:"var(--muted)", fontSize:10, marginTop:2 }}>
              {rep.ratingCount} rating{rep.ratingCount !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      )}

      {/* Rate button */}
      {!rated && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize:11, color:"var(--muted)", marginBottom:4,
                        fontFamily:"var(--mono)" }}>
            Leave a rating:
          </div>
          <div style={{ display:"flex", gap:4 }}>
            {[1,2,3,4,5].map(s => (
              <button
                key={s}
                disabled={busy}
                onClick={() => handleRate(s)}
                onMouseEnter={() => setHover(s)}
                onMouseLeave={() => setHover(0)}
                style={{
                  background:"none", border:"none", cursor:"pointer",
                  fontSize:20, color: s <= (hovered || 0) ? "#f59e0b" : "var(--border)",
                  padding:"0 2px", transition:"color 0.1s",
                }}
              >★</button>
            ))}
          </div>
        </div>
      )}
      {rated && (
        <div style={{ marginTop:8, fontSize:11, color:"var(--accent)",
                      fontFamily:"var(--mono)" }}>
          ✓ Rated
        </div>
      )}
    </div>
  );
}
