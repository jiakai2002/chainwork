/**
 * useTransaction.js
 * Wraps Aptos wallet adapter's signAndSubmitTransaction.
 * Returns { run, busy } — call run(txPayload, successMsg).
 */
import { useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { aptos } from "../services/aptos.js";

export function useTransaction(onToast, onRefresh) {
  const { signAndSubmitTransaction } = useWallet();
  const [busy, setBusy] = useState(false);

  async function run(payload, successMsg) {
    setBusy(true);
    try {
      const response = await signAndSubmitTransaction(payload);
      // Wait for tx to be confirmed on-chain
      await aptos.waitForTransaction({ transactionHash: response.hash });
      onToast(successMsg, "success");
      if (onRefresh) onRefresh();
    } catch (e) {
      const msg = e?.message || e?.toString() || "Transaction failed";
      onToast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return { run, busy };
}
