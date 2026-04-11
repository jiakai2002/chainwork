# ChainWork

> Decentralized freelance platform on **Aptos** (Move). Milestone-based escrow, client-verified quality, cryptographic work proof, and a loyalty token system that rewards long-term participation.

**Deployed on Aptos Testnet:** `0xf6899d06f6f8754cfcd6184d6bff89be92a1a69ea425d7aacdf462cbdf2ea8b9`

---

## The Problem

Traditional freelance platforms (Upwork, Fiverr) fail in three ways: clients can refuse payment arbitrarily, platform reputation is siloed and non-portable, and 10–20% fees fund a middleman that smart contracts can replace.

## The Solution

ChainWork replaces the platform with five Move modules. Clients lock APT per milestone. Freelancers submit deliverables with a cryptographic Ed25519 signature proving authorship. Clients review and approve or reject. Disputed outcomes are resolved by a staked moderator — trustless, transparent, permanent.

---

## Architecture

```
chainwork/
├── move/
│   ├── Move.toml
│   └── sources/
│       ├── work_token.move       ← WORK coin (Aptos Coin standard)
│       ├── reputation.move       ← On-chain scores, streaks, tier tracking
│       ├── moderator_pool.move   ← Staking, round-robin assignment, slashing
│       ├── job_escrow.move       ← Milestone escrow, IPFS proof, payment release
│       └── dispute.move          ← 3-moderator panel voting
├── frontend/src/
│   ├── services/aptos.js         ← All Aptos SDK view/tx calls
│   ├── hooks/useTransaction.js   ← Wallet sign + submit wrapper
│   ├── components/
│   │   ├── Header.jsx            ← WORK balance, tier badge, Petra connect
│   │   └── ReputationBlock.jsx   ← Score display
│   └── pages/
│       ├── ClientJobs.jsx        ← Client view: fund, review, accept/reject
│       ├── FreelancerJobs.jsx    ← Freelancer view: submit work per milestone
│       ├── CreateJob.jsx         ← Multi-milestone job creation (auto-funds)
│       ├── ModeratorDashboard.jsx← Dispute resolution panel (admin/Gold tier)
│       └── TierProgress.jsx      ← WORK balance, tier benefits, streak
└── scripts/
    ├── deploy.md                 ← Full Aptos CLI deploy guide
    └── indexer_query.js          ← Fetch jobs from Aptos Indexer GraphQL
```

---

## Smart Contracts (Move)

### `work_token.move` — WORK Coin
The platform's incentive and loyalty token. Built on Aptos's native `coin` standard.

- `job_escrow` is the only module that can mint — no inflation possible
- Tier thresholds based on cumulative WORK earned (Bronze → Silver → Gold → Platinum)
- Fee discounts: 0% → 10% → 20% → 30% as tier increases
- Holding WORK = holding your tier; spending it costs you benefits (loyalty lock)

### `reputation.move` — On-Chain Scores
Owned resources attached to each wallet — portable, permanent, manipulation-proof.

- Tracks `milestones_completed`, `milestones_disputed`, star ratings, completion rate
- Streak system: consecutive active days multiply WORK rewards (+0.5% per 7-day tier)
- `lifetime_work_earned` never decreases — tier is permanent history, not current balance
- Only `job_escrow` can write outcomes — users cannot self-report

### `moderator_pool.move` — Staking & Assignment
- Gold tier required first (proven freelancer track record before judging others)
- Stake 500+ WORK to activate — collateral at risk on overturned verdicts
- Round-robin assignment from active pool
- Slashing: 10 WORK per overturned verdict; auto-removed if stake drops below minimum

### `job_escrow.move` — Core Escrow
Jobs stored in a global `Table<u64, Job>` — multiple jobs per client supported.

- Client creates job with N milestones (title, APT amount, deadline); auto-funds on creation
- Freelancer submits: uploads deliverable → IPFS CID + Ed25519 wallet signature stored on-chain
- **Client reviews and approves** → payment released (minus 2% fee), WORK minted to freelancer
- **Client rejects** → auto-raises dispute for moderator resolution
- `admin_resolve_dispute` entry function for demo — in production handled by dispute panel

### `dispute.move` — Panel Arbitration
- Either party escalates after submission or rejection
- 3 moderators assigned from pool, vote independently
- Majority (2-of-3) determines: release to freelancer or refund client
- Losing moderator's stake slashed

---

## User Roles & Tab Structure

| Role | Tabs | Actions |
|---|---|---|
| **Client** | My Jobs · Create Job · Moderator* · My Tier | Create, fund, approve/reject milestones, rate freelancer |
| **Freelancer** | My Jobs · Moderator* · My Tier | Submit work (IPFS + signature), dispute rejections |
| **Moderator** | (within Moderator tab) | Resolve disputes, approve/reject as assigned arbitrator |

*Moderator tab visible to Gold tier+ or admin

---

## Demo Flow

```
1. Client creates job (multi-milestone) → APT auto-locked in escrow
         │
         ▼
2. Freelancer submits work
   → File uploaded to IPFS (mock CID for demo)
   → IPFS hash signed with wallet private key (Ed25519)
   → CID + signature stored on-chain (immutable, timestamped)
         │
         ▼
3a. Happy path: Client reviews → ✓ Accept
    → APT released to freelancer (minus 2% fee)
    → WORK tokens minted (base + streak bonus)
    → Client rates freelancer 1–5 ★
         │
3b. Dispute path: Client reviews → ✗ Reject & Dispute
    → Dispute auto-raised
    → Moderator tab: Release to Freelancer or Refund Client
```

---

## Work Verification

```
File → IPFS upload → content-addressed CID
                              │
                    Sign CID with wallet key (Ed25519)
                              │
                    Store CID + signature on-chain
                              │
              Immutable proof: this wallet submitted this file at this time
```

---

## Tokenomics

| Parameter | Value |
|---|---|
| Token | WORK (Aptos Coin, 8 decimals) |
| Reward per milestone | 10 WORK × milestone APT value |
| Streak bonus | +0.5% per 7-day streak tier |
| Platform fee | 2% of milestone value (APT) |
| Moderator stake min | 500 WORK |
| Slash per overturned verdict | 10 WORK |

**Tier thresholds:**

| Tier | WORK | Fee Discount | Unlock |
|---|---|---|---|
| Bronze | 0 | 0% | Standard access |
| Silver | 500 | 10% | Priority queue |
| Gold | 2,000 | 20% | Moderator eligibility |
| Platinum | 10,000 | 30% | Governance voting |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Aptos (Move VM) |
| Smart contracts | Move 2.0, Aptos Framework |
| Job storage | `aptos_std::table::Table<u64, Job>` |
| Frontend | React 18, Vite |
| Wallet | Petra (AIP-62 standard, auto-detected) |
| Web3 SDK | `@aptos-labs/wallet-adapter-react` v4, `@aptos-labs/ts-sdk` |
| File storage | IPFS (CID stored on-chain, mocked for demo) |
| Work proof | Ed25519 wallet signature over IPFS CID |

---

## Setup

See [`scripts/deploy.md`](scripts/deploy.md) for full CLI steps.

```bash
# 1. Compile and publish
cd move/
aptos move publish \
  --named-addresses chainwork=<YOUR_ADDR> \
  --profile admin --assume-yes

# 2. Initialize (run once after publish)
aptos move run --function-id <ADDR>::work_token::initialize --profile admin --assume-yes
aptos move run --function-id <ADDR>::reputation::initialize --profile admin --assume-yes
aptos move run --function-id <ADDR>::moderator_pool::initialize --profile admin --assume-yes
aptos move run --function-id <ADDR>::job_escrow::initialize --profile admin --assume-yes

# 3. Register accounts
aptos move run --function-id <ADDR>::work_token::register --profile admin --assume-yes
aptos move run --function-id <ADDR>::reputation::register_client --profile admin --assume-yes
aptos move run --function-id <ADDR>::reputation::register_freelancer --profile freelancer --assume-yes
aptos move run --function-id <ADDR>::work_token::register --profile freelancer --assume-yes

# 4. Frontend
cd frontend && npm install && npm run dev
```

`frontend/.env`:
```env
VITE_APTOS_NETWORK=testnet
VITE_MODULE_ADDR=0xf6899d06f6f8754cfcd6184d6bff89be92a1a69ea425d7aacdf462cbdf2ea8b9
VITE_MODULE_ADDR=0xf6899d06f6f8754cfcd6184d6bff89be92a1a69ea425d7aacdf462cbdf2ea8b9
VITE_APTOS_API_KEY=<YOUR_API_KEY>
```

View on Aptos Explorer:
`https://explorer.aptoslabs.com/account/0xf6899d06f6f8754cfcd6184d6bff89be92a1a69ea425d7aacdf462cbdf2ea8b9/modules?network=testnet`
