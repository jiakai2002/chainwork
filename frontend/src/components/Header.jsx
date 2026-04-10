import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { TIER_LABELS, TIER_COLORS } from "../services/aptos.js";

export default function Header({ workBalance, tier }) {
  const { account, connected, disconnect, connect, wallets } = useWallet();

  const short = account?.address
    ? `${account.address.toString().slice(0, 6)}…${account.address.toString().slice(-4)}`
    : null;

  const tierColor = TIER_COLORS[tier] || TIER_COLORS[0];

  async function handleConnect() {
    // Find Petra in the detected wallets list; fall back to first available
    const petra = wallets.find(w =>
      w.name?.toLowerCase().includes("petra")
    ) ?? wallets[0];
    if (!petra) {
      alert("Petra wallet not detected. Please install the Petra Chrome extension.");
      return;
    }
    try {
      await connect(petra.name);
    } catch (e) {
      console.error("Connect failed:", e);
    }
  }

  return (
    <header className="header">
      <div className="header-logo">
        Chain<span>Work</span>
      </div>

      <div className="header-right">
        {connected && workBalance !== null && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: "var(--mono)", fontSize: 12,
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 6, padding: "5px 12px",
          }}>
            <span style={{ color: tierColor, fontWeight: 700 }}>⬡</span>
            <span style={{ color: "var(--green)" }}>{workBalance.toFixed(1)}</span>
            <span style={{ color: "var(--muted)" }}>WORK</span>
            <span className="tier-badge" style={{ color: tierColor, borderColor: tierColor, marginLeft: 4 }}>
              {TIER_LABELS[tier] || "Bronze"}
            </span>
          </div>
        )}

        {connected ? (
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: "var(--mono)", fontSize: 12,
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: 6, padding: "5px 12px",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
              {short}
            </div>
            <button className="btn btn-sm btn-danger" onClick={disconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={handleConnect}>
            Connect Petra
          </button>
        )}
      </div>
    </header>
  );
}
