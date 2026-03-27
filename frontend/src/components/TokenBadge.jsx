import { useState, useEffect } from "react";
import { getTokenBalance } from "../services/blockchain.js";

/**
 * Shows the connected wallet's WORK token balance.
 * Refreshes whenever `account` changes.
 */
export default function TokenBadge({ account }) {
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    if (!account) { setBalance(null); return; }
    getTokenBalance(account)
      .then(b => setBalance(parseFloat(b).toFixed(1)))
      .catch(() => setBalance("—"));
  }, [account]);

  if (balance === null) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontFamily: "var(--mono)",
      fontSize: 12,
      background: "var(--surface2)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      padding: "5px 12px",
      color: "var(--accent)",
    }}>
      <span style={{ fontSize:14 }}>⬡</span>
      {balance} <span style={{ color:"var(--muted)" }}>WORK</span>
    </div>
  );
}
