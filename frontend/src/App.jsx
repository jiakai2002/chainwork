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
  getWorkBalance, getTierOf, getFreelancerScore, getAptBalance,
  MODERATOR_ADDR, loadAllJobs,
} from "./services/aptos.js";

function ToastStack({ toasts }) {
  return (
    <div className="toast-stack">
      {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
    </div>
  );
}

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

  const norm = (a) => (a || "").replace("0x", "").toLowerCase().padStart(64, "0");
  const isModerator  = addr ? norm(addr) === norm(MODERATOR_ADDR) : false;
  const isClient     = !isModerator && jobs.some(j => norm(j.client)     === norm(addr || ""));
  const isFreelancer = !isModerator && jobs.some(j => norm(j.freelancer) === norm(addr || ""));
  // If no jobs yet, treat non-moderator as client (can create jobs)
  const isClientRole = !isModerator && (isClient || (!isFreelancer && !isModerator));

  function toast(msg, type = "info") {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  }

  const loadWalletData = useCallback(async () => {
    if (!addr) return;
    const [wb, t, s, ab] = await Promise.all([
      getWorkBalance(addr), getTierOf(addr), getFreelancerScore(addr), getAptBalance(addr),
    ]);
    setWorkBalance(wb); setTier(t); setScore(s); setAptBalance(ab);
  }, [addr]);

  const loadJobs = useCallback(async () => {
    try { setJobs(await loadAllJobs()); } catch { setJobs([]); }
  }, []);

  useEffect(() => { loadWalletData(); loadJobs(); }, [loadWalletData, loadJobs]);

  function refresh() { loadWalletData(); loadJobs(); }

  // ── Role-based tabs ────────────────────────────────────────────────────────
  const TABS = [
    { label: "My Jobs",      content: "client_jobs", show: isClient     },
    { label: "My Jobs",      content: "fl_jobs",     show: isFreelancer },
    { label: "+ Create Job", content: "create",      show: isClientRole },
    { label: "Moderator",    content: "moderator",   show: true         },
    { label: "My Tier",      content: "tier",        show: true         },
  ].filter(t => t.show);

  const activeContent = TABS[tab]?.content ?? "tier";
  useEffect(() => { if (tab >= TABS.length) setTab(0); }, [TABS.length, tab]);

  // Role label for display
  const roleLabel = isModerator ? "Moderator" : isFreelancer ? "Freelancer" : "Client";

  return (
    <div className="app">
      <Header workBalance={workBalance} tier={tier} />
      <main className="main">
        {!connected && (
          <div className="warn-banner" style={{ borderColor: "var(--blue)", color: "var(--blue)", background: "rgba(56,189,248,.07)" }}>
            Connect your Petra wallet to interact with ChainWork on Aptos.
          </div>
        )}

        {connected && (
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              { label: "APT Balance",  val: aptBalance?.toFixed(4)  ?? "…", color: "var(--blue)"  },
              { label: "WORK Balance", val: workBalance?.toFixed(1)  ?? "…", color: "var(--green)" },
              { label: "Role",         val: roleLabel ?? "Unknown",          color: "var(--muted)" },
              { label: "Address",      val: addr ? `${addr.slice(0,10)}…${addr.slice(-4)}` : "…", color: "var(--muted)" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="tabs">
          {TABS.map((t, i) => (
            <button key={`${t.label}-${i}`} className={`tab-btn ${tab === i ? "active" : ""}`} onClick={() => setTab(i)}>
              {t.label}
            </button>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={refresh} style={{ marginLeft: "auto", marginBottom: 1 }}>↻</button>
        </div>

        {activeContent === "client_jobs" && <ClientJobs     jobs={jobs} account={account} onToast={toast} onRefresh={refresh} />}
        {activeContent === "fl_jobs"     && <FreelancerJobs jobs={jobs} account={account} onToast={toast} onRefresh={refresh} />}
        {activeContent === "create"      && <CreateJob onToast={toast} onCreated={() => { refresh(); setTab(0); }} />}
        {activeContent === "moderator"   && <ModeratorDashboard jobs={jobs} isModerator={isModerator} onToast={toast} onRefresh={refresh} />}
        {activeContent === "tier"        && <TierProgress workBalance={workBalance} tier={tier} score={score} />}
      </main>
      <ToastStack toasts={toasts} />
    </div>
  );
}

export default function App() {
  return (
    <AptosWalletAdapterProvider autoConnect={true} optInWallets={["Petra"]} dappConfig={{ network: Network.TESTNET }}>
      <Inner />
    </AptosWalletAdapterProvider>
  );
}
