/**
 * aptos.js
 * All on-chain interactions for ChainWork v2 on Aptos.
 *
 * Pattern:
 *   - Read  → Aptos.view()  (free, no wallet needed)
 *   - Write → signAndSubmitTransaction() via wallet adapter
 */

import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

// ── Config ────────────────────────────────────────────────────────────────────
// Set VITE_APTOS_NETWORK=mainnet|testnet|devnet in .env
// Set VITE_MODULE_ADDR to your deployed module address
export const NETWORK      = import.meta.env.VITE_APTOS_NETWORK || "testnet";
export const MODULE_ADDR  = import.meta.env.VITE_MODULE_ADDR   || "0xCAFE"; // replace after deploy
export const ADMIN_ADDR   = import.meta.env.VITE_ADMIN_ADDR    || MODULE_ADDR;

const config = new AptosConfig({
  network: NETWORK === "mainnet" ? Network.MAINNET
         : NETWORK === "devnet"  ? Network.DEVNET
         :                         Network.TESTNET,
});
export const aptos = new Aptos(config);

// ── Module identifiers ────────────────────────────────────────────────────────
const MOD = (name) => `${MODULE_ADDR}::${name}`;

// ── Status labels (mirrors Move constants) ────────────────────────────────────
export const MILESTONE_STATUS = {
  0: { label: "Open",      color: "#F59E0B" },
  1: { label: "Submitted", color: "#38BDF8" },
  2: { label: "Approved",  color: "#22C55E" },
  3: { label: "Rejected",  color: "#F97316" },
  4: { label: "Disputed",  color: "#EF4444" },
  5: { label: "Refunded",  color: "#6B7394" },
};

// ── Utility ───────────────────────────────────────────────────────────────────
export function octas(apt) { return Math.round(apt * 1e8); }   // APT → octas
export function fromOctas(o) { return Number(o) / 1e8; }       // octas → APT
export function fromWork(w)  { return Number(w) / 1e8; }       // WORK (8 dec)

// ── WORK Token ───────────────────────────────────────────────────────────────
export async function getWorkBalance(addr) {
  try {
    const [bal] = await aptos.view({
      payload: {
        function: `${MOD("work_token")}::balance`,
        typeArguments: [],
        functionArguments: [addr],
      },
    });
    return fromWork(bal);
  } catch { return 0; }
}

export async function getTierOf(addr) {
  try {
    const [tier] = await aptos.view({
      payload: {
        function: `${MOD("work_token")}::tier_of`,
        typeArguments: [],
        functionArguments: [addr],
      },
    });
    return Number(tier);
  } catch { return 0; }
}

export const TIER_LABELS = ["Bronze", "Silver", "Gold", "Platinum"];
export const TIER_COLORS = ["#CD7F32", "#C0C0C0", "#FFD700", "#E5E4E2"];

// ── Reputation ────────────────────────────────────────────────────────────────
export async function getFreelancerScore(addr) {
  try {
    const result = await aptos.view({
      payload: {
        function: `${MOD("reputation")}::freelancer_score`,
        typeArguments: [],
        functionArguments: [addr],
      },
    });
    const [completed, disputed, rejected, totalRating, ratingCount, lifetimeWork, streak] = result;
    return {
      completed:    Number(completed),
      disputed:     Number(disputed),
      rejected:     Number(rejected),
      avgRating:    ratingCount > 0 ? Number(totalRating) / Number(ratingCount) / 100 : 0,
      ratingCount:  Number(ratingCount),
      lifetimeWork: fromWork(lifetimeWork),
      streak:       Number(streak),
    };
  } catch { return null; }
}

export async function getCompletionRate(addr) {
  try {
    const [rate] = await aptos.view({
      payload: {
        function: `${MOD("reputation")}::completion_rate`,
        typeArguments: [],
        functionArguments: [addr],
      },
    });
    return Number(rate);
  } catch { return 0; }
}

export async function getModeratorScore(addr) {
  try {
    const result = await aptos.view({
      payload: {
        function: `${MOD("reputation")}::moderator_score`,
        typeArguments: [],
        functionArguments: [addr],
      },
    });
    const [total, overturned, slashed, stake, active] = result;
    return {
      total:     Number(total),
      overturned:Number(overturned),
      slashed:   fromWork(slashed),
      stake:     fromWork(stake),
      active:    Boolean(active),
    };
  } catch { return null; }
}

export async function isModerator(addr) {
  try {
    const [ok] = await aptos.view({
      payload: {
        function: `${MOD("moderator_pool")}::is_active`,
        typeArguments: [],
        functionArguments: [addr],
      },
    });
    return Boolean(ok);
  } catch { return false; }
}

// ── Milestone reads ───────────────────────────────────────────────────────────
export async function getMilestoneStatus(clientAddr, index) {
  try {
    const [status] = await aptos.view({
      payload: {
        function: `${MOD("job_escrow")}::milestone_status`,
        typeArguments: [],
        functionArguments: [clientAddr, index.toString()],
      },
    });
    return Number(status);
  } catch { return null; }
}

export async function getMilestoneIPFS(clientAddr, index) {
  try {
    const [hash] = await aptos.view({
      payload: {
        function: `${MOD("job_escrow")}::milestone_ipfs`,
        typeArguments: [],
        functionArguments: [clientAddr, index.toString()],
      },
    });
    return hash;
  } catch { return ""; }
}

// ── Account APT balance ───────────────────────────────────────────────────────
export async function getAptBalance(addr) {
  try {
    const res = await aptos.getAccountCoinAmount({
      accountAddress: addr,
      coinType: "0x1::aptos_coin::AptosCoin",
    });
    return fromOctas(res);
  } catch { return 0; }
}

// ── Transaction builders (returned as payloads for wallet adapter) ─────────────

export function tx_registerFreelancer() {
  return {
    data: {
      function: `${MOD("reputation")}::register_freelancer`,
      typeArguments: [],
      functionArguments: [],
    },
  };
}

export function tx_registerWorkToken() {
  return {
    data: {
      function: `${MOD("work_token")}::register`,
      typeArguments: [],
      functionArguments: [],
    },
  };
}

export function tx_createJob({
  freelancer, title, description,
  milestoneTitles, milestoneDescs,
  milestoneAmountsApt, milestoneDeadlinesSecs,
}) {
  // Aptos SDK v4: vectors of u64 must be BigInt arrays;
  // vectors of String must be plain string arrays (SDK encodes them).
  return {
    data: {
      function: `${MOD("job_escrow")}::create_job`,
      typeArguments: [],
      functionArguments: [
        freelancer.startsWith("0x") ? freelancer : `0x${freelancer}`, // address
        title,                                                   // String
        description,                                             // String
        milestoneTitles,                                         // vector<String>
        milestoneDescs,                                          // vector<String>
        milestoneAmountsApt.map(a => BigInt(octas(a))),          // vector<u64>
        milestoneDeadlinesSecs.map(d => BigInt(Math.floor(d))),  // vector<u64>
        ADMIN_ADDR,                                              // address
      ],
    },
  };
}

export function tx_fundMilestone({ milestoneIndex }) {
  return {
    data: {
      function: `${MOD("job_escrow")}::fund_milestone`,
      typeArguments: [],
      functionArguments: [BigInt(milestoneIndex)],
    },
  };
}

export function tx_submitWork({ clientAddr, milestoneIndex, ipfsHash, sig }) {
  return {
    data: {
      function: `${MOD("job_escrow")}::submit_work`,
      typeArguments: [],
      functionArguments: [clientAddr, BigInt(milestoneIndex), ipfsHash, sig, ADMIN_ADDR],
    },
  };
}

export function tx_approveMilestone({ clientAddr, milestoneIndex, verdictIpfs }) {
  return {
    data: {
      function: `${MOD("job_escrow")}::approve_milestone`,
      typeArguments: [],
      functionArguments: [clientAddr, BigInt(milestoneIndex), verdictIpfs, ADMIN_ADDR],
    },
  };
}

export function tx_rejectMilestone({ clientAddr, milestoneIndex, verdictIpfs }) {
  return {
    data: {
      function: `${MOD("job_escrow")}::reject_milestone`,
      typeArguments: [],
      functionArguments: [clientAddr, BigInt(milestoneIndex), verdictIpfs],
    },
  };
}

export function tx_raiseDispute({ clientAddr, milestoneIndex }) {
  return {
    data: {
      function: `${MOD("job_escrow")}::raise_dispute`,
      typeArguments: [],
      functionArguments: [clientAddr, BigInt(milestoneIndex)],
    },
  };
}

export function tx_voteDispute({ panelAddr, approve }) {
  return {
    data: {
      function: `${MOD("dispute")}::vote`,
      typeArguments: [],
      functionArguments: [panelAddr, approve],
    },
  };
}

export function tx_stakeAsModerator({ amount }) {
  return {
    data: {
      function: `${MOD("moderator_pool")}::stake`,
      typeArguments: [],
      functionArguments: [BigInt(octas(amount)), ADMIN_ADDR],
    },
  };
}

export function tx_rateFreelancer({ milestoneIndex, stars }) {
  return {
    data: {
      function: `${MOD("job_escrow")}::rate_freelancer`,
      typeArguments: [],
      functionArguments: [BigInt(milestoneIndex), BigInt(stars)],
    },
  };
}

// ── IPFS helpers (via web3.storage or nft.storage public gateway) ─────────────
export async function uploadToIPFS(file) {
  // In production: use web3.storage SDK or Pinata API
  // For local demo: use a mock hash
  const mockCID = "QmMockHash" + Date.now().toString(36);
  console.warn("IPFS upload mocked — replace with web3.storage in production");
  return mockCID;
}

export function ipfsUrl(cid) {
  return `https://ipfs.io/ipfs/${cid}`;
}

// ── Sign a string with wallet (for work submission proof) ────────────────────
// Pass the signMessage function from useWallet() hook — do not use window.aptos
export async function signMessage(message, signFn) {
  if (!signFn) return "mock-sig-" + Date.now(); // fallback for demo
  const response = await signFn({
    message,
    nonce: Date.now().toString(),
  });
  return response?.signature ?? response?.fullMessage ?? "signed";
}
