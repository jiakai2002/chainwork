import TokenBadge from "./TokenBadge.jsx";

export default function Header({ account, onConnect, loading }) {
  const short = account ? `${account.slice(0,6)}…${account.slice(-4)}` : null;

  return (
    <header className="header">
      <div className="header-logo">Chain<span>Work</span></div>

      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
        <TokenBadge account={account} />

        <button
          className={`wallet-btn ${account ? "connected" : ""}`}
          onClick={onConnect}
          disabled={loading}
        >
          <span className="dot" />
          {loading ? "Connecting…" : account ? short : "Connect Wallet"}
        </button>
      </div>
    </header>
  );
}
