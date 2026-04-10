import { useState, useEffect, useCallback } from "react";
import { AptosWalletAdapterProvider, useWallet } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";

import Header             from "./components/Header.jsx";
import ClientJobs         from "./pages/ClientJobs.jsx";
import FreelancerJobs     from "./pages/FreelancerJobs.jsx";
import CreateJob          from "./pages/CreateJob.jsx";
import ModeratorDashboard from "./pages/ModeratorDashboard.jsx";
import TierProgress       from "./pages/TierProgress.jsx";

import {
  getWorkBalance, getTierOf, getFreelancerScore,
  getAptBalance, NETWORK, ADMIN_ADDR, loadAllJobs,
} from "./services/aptos.js";

// ── Toast ──────────────────────────────────────────────────────────────────────
function ToastStack({ toasts }) {
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
}

// ── Inner ──────────────────────────────────────────────────────────────────────
function Inner() {
  const { account, connected } = useWallet();
  const addr = account?.address ? account.address.toString() : null;

  const [tab,         setTab]         = useState(0);
  const [jobs,        setJobs]        = useState([]);
  const [workBalance, setWorkBalance] = useState(null);
  const [aptBalance,  setAptBalance]  = useState(null);
  const [tier,        setTier]        = useState(0);
  const [score,       setScore]       = useState(null);
  const [toasts,      setToasts]      = useState([]);

  // Role detection
  const adminClean = ADMIN_ADDR.replace("0x", "").toLowerCase();
  const addrClean  = (addr || "").replace("0x", "").toLowerCase();
  const isAdmin    = addrClean.length > 0 && addrClean === adminClean;
  const isClient     = jobs.some(j => j.client     === addr);
  const isFreelancer = jobs.some(j => j.freelancer === addr);
  const isGoldPlus   = isAdmin || tier >= 2; // Admin always sees moderator tab

  function toast(msg, type = "info") {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  }

  const loadWalletData = useCallback(async () => {
    if (!addr) return;
    const [wb, t, s, ab] = await Promise.all([
      getWorkBalance(addr),
      getTierOf(addr),
      getFreelancerScore(addr),
      getAptBalance(addr),
    ]);
    setWorkBalance(wb);
    setTier(t);
    setScore(s);
    setAptBalance(ab);
  }, [addr]);

  const loadJobs = useCallback(async () => {
    try {
      const j = await loadAllJobs();
      setJobs(j);
    } catch { setJobs([]); }
  }, []);

  useEffect(() => {
    loadWalletData();
    loadJobs();
  }, [loadWalletData, loadJobs]);

  function refresh() { loadWalletData(); loadJobs(); }

  // ── Tab definitions ───────────────────────────────────────────────────────
  // Client tabs: My Jobs (as client) · Create Job · Moderator (if gold) · My Tier
  // Freelancer tabs: My Jobs (as freelancer) · Moderator (if gold) · My Tier
  // Admin (has both): My Jobs (client) · My Jobs (freelancer) · Create Job · Moderator · My Tier

  const TABS = [
    { label: "My Jobs (Client)",     content: "client_jobs",  show: isClient || isAdmin },
    { label: "My Jobs (Freelancer)", content: "fl_jobs",      show: isFreelancer && !isAdmin },
    { label: "+ Create Job",         content: "create",       show: isAdmin },
    { label: "Moderator",            content: "moderator",    show: isAdmin || isGoldPlus },
    { label: "My Tier",              content: "tier",         show: true },
  ].filter(t => t.show);

  // If no role yet — show create job for admin, tier for others
  const fallbackTabs = [
    { label: "+ Create Job", content: "create", show: isAdmin },
    { label: "My Tier",      content: "tier",   show: true },
  ].filter(t => t.show);

  const visibleTabs   = TABS.length > 0 ? TABS : fallbackTabs;
  const activeContent = visibleTabs[tab]?.content ?? "tier";

  // Reset tab if out of range
  useEffect(() => {
    if (tab >= visibleTabs.length) setTab(0);
  }, [visibleTabs.length, tab]);

  return (
    <div className="app">
      <Header workBalance={workBalance} tier={tier} />

      <main className="main">
        {!connected && (
          <div className="warn-banner" style={{ borderColor: "var(--blue)", color: "var(--blue)", background: "rgba(56,189,248,.07)" }}>
            Connect your Petra wallet to interact with ChainWork on Aptos.
          </div>
        )}

        {/* Balance bar */}
        {connected && (
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              { label: "APT Balance",  val: aptBalance?.toFixed(4)  ?? "…", color: "var(--blue)"  },
              { label: "WORK Balance", val: workBalance?.toFixed(1)  ?? "…", color: "var(--green)" },
              { label: "Address",      val: addr ? `${addr.slice(0,10)}…${addr.slice(-4)}` : "…", color: "var(--muted)" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="tabs">
          {visibleTabs.map((t, i) => (
            <button key={t.label}
              className={`tab-btn ${tab === i ? "active" : ""}`}
              onClick={() => setTab(i)}>
              {t.label}
            </button>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={refresh}
            style={{ marginLeft: "auto", marginBottom: 1 }}>
            ↻
          </button>
        </div>

        {/* Content */}
        {activeContent === "client_jobs" && (
          <ClientJobs jobs={jobs} account={account} onToast={toast} onRefresh={refresh} />
        )}
        {activeContent === "fl_jobs" && (
          <FreelancerJobs jobs={jobs} account={account} onToast={toast} onRefresh={refresh} />
        )}
        {activeContent === "create" && (
          <CreateJob onToast={toast} onCreated={() => { refresh(); setTab(0); }} />
        )}
        {activeContent === "moderator" && (
          <ModeratorDashboard jobs={jobs} onToast={toast} onRefresh={refresh} />
        )}
        {activeContent === "tier" && (
          <TierProgress workBalance={workBalance} tier={tier} score={score} />
        )}
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}

export default function App() {
  return (
    <AptosWalletAdapterProvider
      autoConnect={true}
      optInWallets={["Petra"]}
      dappConfig={{ network: Network.TESTNET }}
    >
      <Inner />
    </AptosWalletAdapterProvider>
  );
}
