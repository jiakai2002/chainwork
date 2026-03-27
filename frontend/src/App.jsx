import { useState, useEffect, useCallback } from "react";
import Header from "./components/Header.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import { connectWallet, fetchAllJobs } from "./services/blockchain.js";

// ── Toast system ──────────────────────────────────────────────────────────────
function ToastStack({ toasts }) {
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [account, setAccount] = useState(null);
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts]   = useState([]);

  function toast(msg, type = "info") {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }

  const loadJobs = useCallback(async () => {
    try {
      const list = await fetchAllJobs();
      setJobs(list);
    } catch (e) {
      // Contract not yet deployed or no network — just show empty
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    loadJobs();

    // Listen for wallet account changes
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", accs => {
        setAccount(accs[0] || null);
      });
      window.ethereum.on("chainChanged", () => window.location.reload());

      // Auto-connect if already permitted
      window.ethereum.request({ method: "eth_accounts" }).then(accs => {
        if (accs.length) setAccount(accs[0]);
      });
    }
  }, [loadJobs]);

  async function handleConnect() {
    setLoading(true);
    try {
      const addr = await connectWallet();
      setAccount(addr);
      toast(`Connected: ${addr.slice(0, 8)}…`, "success");
      loadJobs();
    } catch (e) {
      toast(e.message || "Connection failed", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <Header account={account} onConnect={handleConnect} loading={loading} />

      <main className="main">
        {!window.ethereum && (
          <div style={{
            padding: "12px 16px",
            marginBottom: 20,
            borderRadius: 6,
            border: "1px solid var(--warn)",
            background: "rgba(245,158,11,0.07)",
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: "var(--warn)",
          }}>
            ⚠ MetaMask not detected. Please install the MetaMask browser extension to use ChainWork.
          </div>
        )}

        <Dashboard
          jobs={jobs}
          account={account}
          onRefresh={loadJobs}
          onToast={toast}
        />
      </main>

      <ToastStack toasts={toasts} />
    </div>
  );
}
