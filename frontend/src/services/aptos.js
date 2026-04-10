/**
 * aptos.js - ChainWork / Work3 frontend service layer
 * All on-chain interactions via Aptos TS SDK v4
 */
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

export const NETWORK     = import.meta.env.VITE_APTOS_NETWORK || "testnet";
export const MODULE_ADDR = import.meta.env.VITE_MODULE_ADDR   || "0xCAFE";
export const ADMIN_ADDR  = import.meta.env.VITE_ADMIN_ADDR    || MODULE_ADDR;

const config = new AptosConfig({
  network: NETWORK === "mainnet" ? Network.MAINNET
         : NETWORK === "devnet"  ? Network.DEVNET
         :                         Network.TESTNET,
  clientConfig: {
    API_KEY: import.meta.env.VITE_APTOS_API_KEY || undefined,
  },
});
export const aptos = new Aptos(config);

const MOD = (name) => `${MODULE_ADDR}::${name}`;

export const MILESTONE_STATUS = {
  0: { label: "Open",      color: "#F59E0B" },
  1: { label: "Submitted", color: "#38BDF8" },
  2: { label: "Approved",  color: "#22C55E" },
  3: { label: "Rejected",  color: "#F97316" },
  4: { label: "Disputed",  color: "#EF4444" },
  5: { label: "Refunded",  color: "#6B7394" },
};

export function octas(apt) { return Math.round(apt * 1e8); }
export function fromOctas(o) { return Number(o) / 1e8; }
export function fromWork(w)  { return Number(w) / 1e8; }

// ── WORK token ────────────────────────────────────────────────────────────────
export async function getWorkBalance(addr) {
  try {
    const [bal] = await aptos.view({
      payload: { function: `${MOD("work_token")}::balance`, typeArguments: [], functionArguments: [addr] },
    });
    return fromWork(bal);
  } catch { return 0; }
}

export async function getTierOf(addr) {
  try {
    const [tier] = await aptos.view({
      payload: { function: `${MOD("work_token")}::tier_of`, typeArguments: [], functionArguments: [addr] },
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
      payload: { function: `${MOD("reputation")}::freelancer_score`, typeArguments: [], functionArguments: [addr] },
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
      payload: { function: `${MOD("reputation")}::completion_rate`, typeArguments: [], functionArguments: [addr] },
    });
    return Number(rate);
  } catch { return 0; }
}

export async function streak_days(addr) {
  try {
    const [s] = await aptos.view({
      payload: { function: `${MOD("reputation")}::streak_days`, typeArguments: [], functionArguments: [addr] },
    });
    return Number(s);
  } catch { return 0; }
}

export async function isModerator(addr) {
  try {
    const [ok] = await aptos.view({
      payload: { function: `${MOD("moderator_pool")}::is_active`, typeArguments: [], functionArguments: [addr] },
    });
    return Boolean(ok);
  } catch { return false; }
}

// ── APT balance ───────────────────────────────────────────────────────────────
export async function getAptBalance(addr) {
  try {
    const res = await aptos.getAccountCoinAmount({
      accountAddress: addr,
      coinType: "0x1::aptos_coin::AptosCoin",
    });
    return fromOctas(res);
  } catch { return 0; }
}

// ── Load all jobs from JobStore table ─────────────────────────────────────────
export async function loadAllJobs() {
  try {
    // Get total job count
    const [total] = await aptos.view({
      payload: { function: `${MOD("job_escrow")}::total_jobs`, typeArguments: [], functionArguments: [ADMIN_ADDR] },
    });
    const count = Number(total);
    if (count === 0) return [];

    // Get the JobStore resource to find the table handle
    const store = await aptos.getAccountResource({
      accountAddress: ADMIN_ADDR,
      resourceType: `${MODULE_ADDR}::job_escrow::JobStore`,
    });
    const tableHandle = store.jobs.handle;

    const jobs = [];
    for (let id = 1; id <= count; id++) {
      try {
        const entry = await aptos.getTableItem({
          handle: tableHandle,
          data: {
            key_type: "u64",
            value_type: `${MODULE_ADDR}::job_escrow::Job`,
            key: id.toString(),
          },
        });
        if (entry) {
          jobs.push({
            id:          Number(entry.id),
            client:      entry.client,
            freelancer:  entry.freelancer,
            title:       entry.title,
            description: entry.description,
            admin_addr:  entry.admin_addr,
            milestones:  (entry.milestones || []).map((m, i) => ({
              ...m,
              index:          i,
              amount_apt:     Number(m.amount_apt),
              deadline_secs:  Number(m.deadline_secs),
              status:         Number(m.status),
              revision_count: Number(m.revision_count),
              submitted_at:   Number(m.submitted_at),
            })),
          });
        }
      } catch { /* skip missing id */ }
    }
    return jobs;
  } catch (e) {
    console.error("loadAllJobs error:", e);
    return [];
  }
}

// ── Transaction builders ───────────────────────────────────────────────────────

export function tx_registerFreelancer() {
  return { data: { function: `${MOD("reputation")}::register_freelancer`, typeArguments: [], functionArguments: [] } };
}

export function tx_registerWorkToken() {
  return { data: { function: `${MOD("work_token")}::register`, typeArguments: [], functionArguments: [] } };
}

export function tx_createJob({ freelancer, title, description, milestoneTitles, milestoneDescs, milestoneAmountsApt, milestoneDeadlinesSecs }) {
  const addr = freelancer.startsWith("0x") ? freelancer : `0x${freelancer}`;
  return {
    data: {
      function: `${MOD("job_escrow")}::create_job`,
      typeArguments: [],
      functionArguments: [
        addr,
        title,
        description,
        milestoneTitles,
        milestoneDescs,
        milestoneAmountsApt.map(a => BigInt(octas(a))),
        milestoneDeadlinesSecs.map(d => BigInt(Math.floor(d))),
        ADMIN_ADDR,
      ],
    },
  };
}

export function tx_fundMilestone({ jobId, milestoneIndex }) {
  return {
    data: {
      function: `${MOD("job_escrow")}::fund_milestone`,
      typeArguments: [],
      functionArguments: [BigInt(jobId), BigInt(milestoneIndex), ADMIN_ADDR],
    },
  };
}

export function tx_submitWork({ jobId, milestoneIndex, ipfsHash, sig }) {
  return {
    data: {
      function: `${MOD("job_escrow")}::submit_work`,
      typeArguments: [],
      functionArguments: [BigInt(jobId), BigInt(milestoneIndex), ipfsHash, sig, ADMIN_ADDR],
    },
  };
}

export function tx_approveMilestone({ jobId, milestoneIndex, verdictIpfs }) {
  return {
    data: {
      function: `${MOD("job_escrow")}::approve_milestone`,
      typeArguments: [],
      functionArguments: [BigInt(jobId), BigInt(milestoneIndex), verdictIpfs, ADMIN_ADDR],
    },
  };
}

export function tx_rejectMilestone({ jobId, milestoneIndex, verdictIpfs }) {
  return {
    data: {
      function: `${MOD("job_escrow")}::reject_milestone`,
      typeArguments: [],
      functionArguments: [BigInt(jobId), BigInt(milestoneIndex), verdictIpfs, ADMIN_ADDR],
    },
  };
}

export function tx_raiseDispute({ jobId, milestoneIndex }) {
  return {
    data: {
      function: `${MOD("job_escrow")}::raise_dispute`,
      typeArguments: [],
      functionArguments: [BigInt(jobId), BigInt(milestoneIndex), ADMIN_ADDR],
    },
  };
}

export function tx_resolveDispute({ jobId, milestoneIndex, releaseToFreelancer }) {
  return {
    data: {
      function: `${MOD("job_escrow")}::admin_resolve_dispute`,
      typeArguments: [],
      functionArguments: [BigInt(jobId), BigInt(milestoneIndex), releaseToFreelancer, ADMIN_ADDR],
    },
  };
}

export function tx_rateFreelancer({ jobId, milestoneIndex, stars }) {
  return {
    data: {
      function: `${MOD("job_escrow")}::rate_freelancer`,
      typeArguments: [],
      functionArguments: [BigInt(jobId), BigInt(milestoneIndex), BigInt(stars), ADMIN_ADDR],
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

// ── IPFS (mocked for demo) ────────────────────────────────────────────────────
export async function uploadToIPFS(file) {
  const mockCID = "QmMock" + Date.now().toString(36);
  console.warn("IPFS upload mocked");
  return mockCID;
}

export function ipfsUrl(cid) {
  return `https://ipfs.io/ipfs/${cid}`;
}

export async function signMessage(message, signFn) {
  if (!signFn) return "mock-sig-" + Date.now();
  const response = await signFn({ message, nonce: Date.now().toString() });
  return response?.signature ?? response?.fullMessage ?? "signed";
}
