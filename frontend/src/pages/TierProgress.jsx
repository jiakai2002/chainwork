import { TIER_LABELS, TIER_COLORS } from "../services/aptos.js";

const TIER_BENEFITS = [
  { tier: 0, label: "Bronze",   work: 0,      feeCut: "0%",  perks: ["Standard 2% fee", "Standard moderator queue"] },
  { tier: 1, label: "Silver",   work: 500,    feeCut: "10%", perks: ["1.8% effective fee", "Faster queue priority"] },
  { tier: 2, label: "Gold",     work: 2000,   feeCut: "20%", perks: ["1.6% effective fee", "Moderator eligibility", "Direct client matching"] },
  { tier: 3, label: "Platinum", work: 10000,  feeCut: "30%", perks: ["1.4% effective fee", "Governance voting", "Moderator training rights"] },
];

export default function TierProgress({ workBalance, tier, score }) {
  const current = TIER_BENEFITS[tier ?? 0];
  const next    = TIER_BENEFITS[(tier ?? 0) + 1];

  const progressPct = next
    ? Math.min(100, ((workBalance - current.work) / (next.work - current.work)) * 100)
    : 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>

      {/* ── Current tier card ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700,
              color: TIER_COLORS[tier ?? 0], lineHeight: 1,
            }}>
              {current.label}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
              {current.feeCut} fee discount · {current.work.toLocaleString()} WORK threshold
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700, color: "var(--green)" }}>
              {workBalance?.toFixed(1) ?? "—"}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>WORK balance</div>
          </div>
        </div>

        {/* Progress bar to next tier */}
        {next && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
                Progress to {next.label}
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
                {workBalance?.toFixed(0)} / {next.work.toLocaleString()} WORK
              </span>
            </div>
            <div style={{ background: "var(--border)", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{
                width: `${progressPct}%`, height: "100%",
                background: TIER_COLORS[(tier ?? 0) + 1] || "var(--green)",
                borderRadius: 4, transition: "width .5s ease",
              }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              {next ? `${(next.work - (workBalance ?? 0)).toFixed(0)} WORK to ${next.label}` : "Max tier reached"}
            </div>
          </div>
        )}
      </div>

      {/* ── Streak card ── */}
      {score && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 4 }}>
                Activity Streak
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color: "var(--orange)" }}>
                🔥 {score.streak} days
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--gold)", fontWeight: 600 }}>
                +{Math.floor(score.streak / 7) * 0.5}% WORK bonus
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                per milestone (0.5% per 7-day tier)
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
            Complete a milestone every 48 hours to maintain your streak.
            Streaks multiply your WORK rewards — the longer you stay active, the more you earn.
          </div>
        </div>
      )}

      {/* ── Tier benefits table ── */}
      <div className="card">
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 12 }}>
          Tier Benefits
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {TIER_BENEFITS.map(t => (
            <div key={t.tier} style={{
              background: t.tier === (tier ?? 0) ? "rgba(34,197,94,.06)" : "var(--surface2)",
              border: `1px solid ${t.tier === (tier ?? 0) ? TIER_COLORS[t.tier] : "var(--border)"}`,
              borderRadius: 6, padding: "12px 10px",
            }}>
              <div style={{
                fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700,
                color: TIER_COLORS[t.tier], marginBottom: 4,
              }}>
                {t.label}
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", marginBottom: 8 }}>
                {t.work.toLocaleString()} WORK
              </div>
              {t.perks.map((p, i) => (
                <div key={i} style={{ fontSize: 11, color: "var(--text)", marginBottom: 3, display: "flex", gap: 4 }}>
                  <span style={{ color: TIER_COLORS[t.tier] }}>›</span> {p}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Loyalty lock explanation ── */}
      <div className="card" style={{ borderColor: "var(--blue)" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--blue)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>
          Why stay in ChainWork?
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
          Your WORK balance, tier status, streak, and on-chain reputation are tied to your wallet —
          not any platform account. Leaving means losing your tier benefits, streak bonus, and moderator
          eligibility. The longer and more consistently you work in the system, the more you accumulate
          and the more you'd lose by switching. <span style={{ color: "var(--text)" }}>This is by design.</span>
        </div>
      </div>
    </div>
  );
}
