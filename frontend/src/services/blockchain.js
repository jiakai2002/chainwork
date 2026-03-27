import { ethers } from "ethers";

// ─────────────────────────────────────────────────────────────────────────────
// ABIs
// ─────────────────────────────────────────────────────────────────────────────

export const ESCROW_ABI = [
  // writes
  { type:"function", name:"createJob",           stateMutability:"payable",
    inputs:[{name:"title",type:"string"},{name:"description",type:"string"},
            {name:"freelancer",type:"address"},{name:"deadlineDays",type:"uint256"}],
    outputs:[{name:"jobId",type:"uint256"}] },
  { type:"function", name:"assignFreelancer",     stateMutability:"nonpayable",
    inputs:[{name:"jobId",type:"uint256"},{name:"freelancer",type:"address"}],
    outputs:[] },
  { type:"function", name:"submitWork",           stateMutability:"nonpayable",
    inputs:[{name:"jobId",type:"uint256"},{name:"submission",type:"string"}],
    outputs:[] },
  { type:"function", name:"approvePayment",       stateMutability:"nonpayable",
    inputs:[{name:"jobId",type:"uint256"}], outputs:[] },
  { type:"function", name:"raiseDispute",         stateMutability:"nonpayable",
    inputs:[{name:"jobId",type:"uint256"}], outputs:[] },
  { type:"function", name:"resolveDispute",       stateMutability:"nonpayable",
    inputs:[{name:"jobId",type:"uint256"},{name:"clientBps",type:"uint256"}],
    outputs:[] },
  { type:"function", name:"resolveAfterDeadline", stateMutability:"nonpayable",
    inputs:[{name:"jobId",type:"uint256"}], outputs:[] },
  // reads
  { type:"function", name:"totalJobs",  stateMutability:"view", inputs:[],
    outputs:[{name:"",type:"uint256"}] },
  { type:"function", name:"getJob",     stateMutability:"view",
    inputs:[{name:"jobId",type:"uint256"}],
    outputs:[{ name:"", type:"tuple", components:[
      {name:"id",type:"uint256"},{name:"client",type:"address"},
      {name:"freelancer",type:"address"},{name:"title",type:"string"},
      {name:"description",type:"string"},{name:"payment",type:"uint256"},
      {name:"deadline",type:"uint256"},{name:"status",type:"uint8"},
      {name:"workSubmission",type:"string"},{name:"arbitrator",type:"address"}
    ]}] },
  { type:"function", name:"defaultArbitrator", stateMutability:"view",
    inputs:[], outputs:[{name:"",type:"address"}] },
  { type:"function", name:"REWARD_PER_JOB",    stateMutability:"view",
    inputs:[], outputs:[{name:"",type:"uint256"}] },
  { type:"function", name:"FEE_BPS",           stateMutability:"view",
    inputs:[], outputs:[{name:"",type:"uint256"}] },
  // events
  { type:"event", name:"JobCreated",
    inputs:[{name:"jobId",type:"uint256",indexed:true},{name:"client",type:"address",indexed:true},
            {name:"title",type:"string",indexed:false},{name:"payment",type:"uint256",indexed:false},
            {name:"deadline",type:"uint256",indexed:false}] },
  { type:"event", name:"WorkSubmitted",
    inputs:[{name:"jobId",type:"uint256",indexed:true},{name:"freelancer",type:"address",indexed:true},
            {name:"workSubmission",type:"string",indexed:false}] },
  { type:"event", name:"DisputeRaised",
    inputs:[{name:"jobId",type:"uint256",indexed:true},{name:"raisedBy",type:"address",indexed:true}] },
  { type:"event", name:"DisputeResolved",
    inputs:[{name:"jobId",type:"uint256",indexed:true},{name:"arbitrator",type:"address",indexed:true},
            {name:"clientShare",type:"uint256",indexed:false},{name:"freelancerShare",type:"uint256",indexed:false}] },
  { type:"event", name:"PaymentReleased",
    inputs:[{name:"jobId",type:"uint256",indexed:true},{name:"freelancer",type:"address",indexed:true},
            {name:"amount",type:"uint256",indexed:false}] },
  { type:"event", name:"RewardMinted",
    inputs:[{name:"jobId",type:"uint256",indexed:true},{name:"freelancer",type:"address",indexed:true},
            {name:"amount",type:"uint256",indexed:false}] },
];

export const TOKEN_ABI = [
  { type:"function", name:"balanceOf",  stateMutability:"view",
    inputs:[{name:"",type:"address"}], outputs:[{name:"",type:"uint256"}] },
  { type:"function", name:"totalSupply",stateMutability:"view",
    inputs:[], outputs:[{name:"",type:"uint256"}] },
  { type:"function", name:"name",       stateMutability:"view",
    inputs:[], outputs:[{name:"",type:"string"}] },
  { type:"function", name:"symbol",     stateMutability:"view",
    inputs:[], outputs:[{name:"",type:"string"}] },
  { type:"function", name:"decimals",   stateMutability:"view",
    inputs:[], outputs:[{name:"",type:"uint8"}] },
];

export const REP_ABI = [
  { type:"function", name:"getScore", stateMutability:"view",
    inputs:[{name:"user",type:"address"}],
    outputs:[{ name:"", type:"tuple", components:[
      {name:"jobsCompleted",type:"uint256"},{name:"jobsDisputed",type:"uint256"},
      {name:"jobsRefunded",type:"uint256"},{name:"totalRating",type:"uint256"},
      {name:"ratingCount",type:"uint256"}
    ]}] },
  { type:"function", name:"averageRating",  stateMutability:"view",
    inputs:[{name:"user",type:"address"}], outputs:[{name:"",type:"uint256"}] },
  { type:"function", name:"completionRate", stateMutability:"view",
    inputs:[{name:"user",type:"address"}], outputs:[{name:"",type:"uint256"}] },
  { type:"function", name:"rate",           stateMutability:"nonpayable",
    inputs:[{name:"subject",type:"address"},{name:"stars",type:"uint8"}], outputs:[] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Contract addresses — written by scripts/deploy.js
// ─────────────────────────────────────────────────────────────────────────────

let ESCROW_ADDRESS = import.meta.env.VITE_ESCROW_ADDRESS || "";
let TOKEN_ADDRESS  = import.meta.env.VITE_TOKEN_ADDRESS  || "";
let REP_ADDRESS    = import.meta.env.VITE_REP_ADDRESS    || "";

try {
  const addr = (await import("./addresses.json")).default;
  if (addr.FreelanceEscrow)  ESCROW_ADDRESS = addr.FreelanceEscrow;
  if (addr.WorkToken)        TOKEN_ADDRESS  = addr.WorkToken;
  if (addr.ReputationSystem) REP_ADDRESS    = addr.ReputationSystem;
} catch { /* not yet deployed */ }

export { ESCROW_ADDRESS, TOKEN_ADDRESS, REP_ADDRESS };

// ─────────────────────────────────────────────────────────────────────────────
// Provider helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getReadProvider() {
  if (window.ethereum) return new ethers.BrowserProvider(window.ethereum);
  return new ethers.JsonRpcProvider("http://127.0.0.1:8545");
}

export async function getProvider() {
  if (!window.ethereum) throw new Error("MetaMask not detected.");
  return new ethers.BrowserProvider(window.ethereum);
}

export async function getSigner() {
  const p = await getProvider();
  await p.send("eth_requestAccounts", []);
  return p.getSigner();
}

export async function connectWallet() {
  const s = await getSigner();
  return s.getAddress();
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract instances
// ─────────────────────────────────────────────────────────────────────────────

export function escrowContract(signerOrProvider) {
  if (!ESCROW_ADDRESS) throw new Error("FreelanceEscrow not deployed yet.");
  return new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, signerOrProvider);
}

export function tokenContract(signerOrProvider) {
  if (!TOKEN_ADDRESS) throw new Error("WorkToken not deployed yet.");
  return new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signerOrProvider);
}

export function repContract(signerOrProvider) {
  if (!REP_ADDRESS) throw new Error("ReputationSystem not deployed yet.");
  return new ethers.Contract(REP_ADDRESS, REP_ABI, signerOrProvider);
}

// ─────────────────────────────────────────────────────────────────────────────
// Job helpers
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_LABELS = ["Open","Work Submitted","Disputed","Completed","Refunded"];
export const STATUS_COLORS = ["#f59e0b","#38bdf8","#f97316","#4ade80","#f87171"];

function parseJob(raw) {
  return {
    id:             Number(raw.id),
    client:         raw.client,
    freelancer:     raw.freelancer,
    title:          raw.title,
    description:    raw.description,
    payment:        ethers.formatEther(raw.payment),
    paymentWei:     raw.payment,
    deadline:       Number(raw.deadline) * 1000,
    status:         Number(raw.status),
    workSubmission: raw.workSubmission,
    arbitrator:     raw.arbitrator,
  };
}

export async function fetchAllJobs() {
  const provider = getReadProvider();
  const c = escrowContract(provider);
  const total = Number(await c.totalJobs());
  const jobs = [];
  for (let i = 1; i <= total; i++) {
    jobs.push(parseJob(await c.getJob(i)));
  }
  return jobs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Escrow writes
// ─────────────────────────────────────────────────────────────────────────────

export async function createJob({ title, description, freelancer, deadlineDays, paymentEth }) {
  const signer = await getSigner();
  const c = escrowContract(signer);
  const value = ethers.parseEther(String(paymentEth));
  const addr  = freelancer && ethers.isAddress(freelancer) ? freelancer : ethers.ZeroAddress;
  return (await c.createJob(title, description, addr, Number(deadlineDays), { value })).wait();
}

export async function assignFreelancer(jobId, freelancer) {
  const signer = await getSigner();
  return (await escrowContract(signer).assignFreelancer(jobId, freelancer)).wait();
}

export async function submitWork(jobId, submission) {
  const signer = await getSigner();
  return (await escrowContract(signer).submitWork(jobId, submission)).wait();
}

export async function approvePayment(jobId) {
  const signer = await getSigner();
  return (await escrowContract(signer).approvePayment(jobId)).wait();
}

export async function raiseDispute(jobId) {
  const signer = await getSigner();
  return (await escrowContract(signer).raiseDispute(jobId)).wait();
}

export async function resolveDispute(jobId, clientBps) {
  const signer = await getSigner();
  return (await escrowContract(signer).resolveDispute(jobId, clientBps)).wait();
}

export async function resolveAfterDeadline(jobId) {
  const signer = await getSigner();
  return (await escrowContract(signer).resolveAfterDeadline(jobId)).wait();
}

// ─────────────────────────────────────────────────────────────────────────────
// Token reads
// ─────────────────────────────────────────────────────────────────────────────

export async function getTokenBalance(address) {
  const c = tokenContract(getReadProvider());
  const raw = await c.balanceOf(address);
  return ethers.formatEther(raw);  // 18 decimals → human string
}

// ─────────────────────────────────────────────────────────────────────────────
// Reputation reads + write
// ─────────────────────────────────────────────────────────────────────────────

export async function getReputation(address) {
  const c = repContract(getReadProvider());
  const [score, avgRating, compRate] = await Promise.all([
    c.getScore(address),
    c.averageRating(address),
    c.completionRate(address),
  ]);
  return {
    jobsCompleted:  Number(score.jobsCompleted),
    jobsDisputed:   Number(score.jobsDisputed),
    jobsRefunded:   Number(score.jobsRefunded),
    ratingCount:    Number(score.ratingCount),
    avgRating:      Number(avgRating) / 10,   // e.g. 45 → 4.5
    completionRate: Number(compRate),          // 0–100
  };
}

export async function rateUser(address, stars) {
  const signer = await getSigner();
  return (await repContract(signer).rate(address, stars)).wait();
}
