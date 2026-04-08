import { useState, useEffect, useCallback } from "react";
import { AptosWalletAdapterProvider, useWallet } from "@aptos-labs/wallet-adapter-react";

import Header           from "./components/Header.jsx";
import Dashboard        from "./pages/Dashboard.jsx";
import CreateJob        from "./pages/CreateJob.jsx";
import ModeratorDashboard from "./pages/ModeratorDashboard.jsx";
import TierProgress     from "./pages/TierProgress.jsx";

import {
  getWorkBalance, getTierOf, getFreelancerScore,
  getAptBalance, isModerator, NETWORK,
} from "./services/aptos.js";

// ── Toast system ──────────────────────────────────────────────────────────────
function ToastStack({ toasts }) {
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
}

// ── Inner app (needs wallet context) ─────────────────────────────────────────
function Inner() {
  const { account, connected } = useWallet();
  const addr = account?.address;

  const [tab,         setTab]         = useState(0);
  const [jobs,        setJobs]        = useState([]);
  const [workBalance, setWorkBalance] = useState(null);
  const [aptBalance,  setAptBalance]  = useState(null);
  const [tier,        setTier]        = useState(0);
  const [score,       setScore]       = useState(null);
  const [isMod,       setIsMod]       = useState(false);
  const [toasts,      setToasts]      = useState([]);

  function toast(msg, type = "info") {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  }

  // Load wallet-specific data
  const loadWalletData = useCallback(async () => {
    if (!addr) return;
    const [wb, t, s, ab, mod] = await Promise.all([
      getWorkBalance(addr),
      getTierOf(addr),
      getFreelancerScore(addr),
      getAptBalance(addr),
      isModerator(addr),
    ]);
    setWorkBalance(wb);
    setTier(t);
    setScore(s);
    setAptBalance(ab);
    setIsMod(mod);
  }, [addr]);

  // In a real app: fetch jobs from an indexer (Aptos indexer GraphQL) or your backend
  // that listens to on-chain events. For the MVP, we use a local mock + refresh trigger.
  const loadJobs = useCallback(async () => {
    // TODO: Replace with Aptos indexer query or backend API
    // e.g. fetch(`/api/jobs?network=${NETWORK}`)
    //      or aptos.getEvents({ ... JobCreated events })
    setJobs([]); // placeholder — see scripts/indexer_query.js
  }, []);

  useEffect(() => {
    loadWalletData();
    loadJobs();
  }, [loadWalletData, loadJobs]);

  // Auto-refresh wallet data every 30s when connected
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(loadWalletData, 30_000);
    return () => clearInterval(t);
  }, [connected, loadWalletData]);

  function refresh() {
    loadWalletData();
    loadJobs();
  }

  const TABS = [
    { label: "Dashboard",   show: true },
    { label: "+ Create Job",show: true },
    { label: "Moderator",   show: isMod },
    { label: "My Tier",     show: true },
  ];

  return (
    <div className="app">
      <Header workBalance={workBalance} tier={tier} />

      <main className="main">
        {/* Network banner */}
        {NETWORK !== "mainnet" && (
          <div className="warn-banner">
            ⚠ Connected to <strong>{NETWORK}</strong> — not mainnet. Use Aptos faucet for test APT.
          </div>
        )}

        {/* Wallet prompt */}
        {!connected && (
          <div className="warn-banner" style={{ borderColor: "var(--blue)", color: "var(--blue)", background: "rgba(56,189,248,.07)" }}>
            Connect your Petra wallet to interact with ChainWork on Aptos.
          </div>
        )}

        {/* Balance bar */}
        {connected && (
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              { label: "APT Balance", val: aptBalance?.toFixed(4) ?? "…", color: "var(--blue)" },
              { label: "WORK Balance", val: workBalance?.toFixed(1) ?? "…", color: "var(--green)" },
              { label: "Address", val: addr ? `${addr.slice(0,10)}…${addr.slice(-4)}` : "…", color: "var(--muted)" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 6, padding: "8px 14px",
              }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="tabs">
          {TABS.filter(t => t.show).map((t, i) => (
            <button key={t.label}
              className={`tab-btn ${tab === i ? "active" : ""}`}
              onClick={() => setTab(i)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 0 && (
          <Dashboard jobs={jobs} account={account} onToast={toast} onRefresh={refresh} />
        )}
        {tab === 1 && (
          <CreateJob onToast={toast} onCreated={() => { refresh(); setTab(0); }} />
        )}
        {tab === 2 && isMod && (
          <ModeratorDashboard jobs={jobs} onToast={toast} onRefresh={refresh} />
        )}
        {tab === (isMod ? 3 : 2) && (
          <TierProgress workBalance={workBalance} tier={tier} score={score} />
        )}
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}

// ── Root with provider ────────────────────────────────────────────────────────
export default function App() {
  return (
    <AptosWalletAdapterProvider autoConnect={true} optInWallets={["Petra"]}>
      <Inner />
    </AptosWalletAdapterProvider>
  );
}
