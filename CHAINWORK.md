# ChainWork

> Decentralized freelance platform on **Aptos** (Move). Milestone-based escrow, moderator-verified quality, cryptographic work proof, and a loyalty token system that rewards long-term participation.

---

## The Problem

Traditional freelance platforms (Upwork, Fiverr) fail in three ways: clients can refuse payment arbitrarily, platform reputation is siloed and non-portable, and 10–20% fees fund a middleman that smart contracts can replace.

## The Solution

ChainWork replaces the platform with four Move modules. Clients lock APT per milestone. Freelancers submit deliverables with a cryptographic signature. A staked moderator verifies quality. Funds release automatically on approval — no subjective client veto.

---

## Architecture

```
chainwork/
├── move/
│   ├── Move.toml
│   └── sources/
│       ├── work_token.move       ← WORK coin (Aptos Coin standard, ERC-20 equivalent)
│       ├── reputation.move       ← On-chain scores, streaks, tier tracking
│       ├── moderator_pool.move   ← Staking, round-robin assignment, slashing
│       ├── job_escrow.move       ← Milestone escrow, IPFS hash storage, payment release
│       └── dispute.move          ← 3-moderator panel voting
├── frontend/src/
│   ├── services/aptos.js         ← All Aptos SDK view/tx calls
│   ├── hooks/useTransaction.js   ← Wallet sign + submit wrapper
│   ├── components/
│   │   ├── Header.jsx            ← WORK balance, tier badge, Petra connect
│   │   ├── MilestoneCard.jsx     ← File upload → IPFS → sign → submit; verdict UI
│   │   └── ReputationBlock.jsx   ← Score display
│   └── pages/
│       ├── Dashboard.jsx         ← Job overview with milestone expansion
│       ├── CreateJob.jsx         ← Multi-milestone form
│       ├── ModeratorDashboard.jsx← Assessment queue + dispute panel
│       └── TierProgress.jsx      ← WORK balance, tier benefits, streak
└── scripts/
    ├── deploy.md                 ← Aptos CLI deploy guide
    └── indexer_query.js          ← How to fetch jobs from Aptos Indexer
```

---

## Smart Contracts (Move)

### `work_token.move` — WORK Coin
The platform's incentive layer. Implements the Aptos `coin` standard from scratch (no OpenZeppelin equivalent).

- 1,000,000 initial supply minted to deployer
- Only `job_escrow` can call `mint_reward()` — prevents inflation
- Tier thresholds (Bronze / Silver / Gold / Platinum) based on lifetime balance
- Fee discounts: 0% → 10% → 20% → 30% as tier increases

### `reputation.move` — On-Chain Scores
Owned resources attached to each wallet — portable, permanent, manipulation-proof.

- Tracks `milestones_completed`, `milestones_disputed`, `milestones_rejected`, star ratings
- Streak system: consecutive active days multiply WORK rewards (+0.5% per 7-day tier)
- `lifetime_work_earned` never decreases — tier status is permanent history
- Only `job_escrow` can write outcomes — users cannot self-report

### `moderator_pool.move` — Staking & Assignment
- Gold tier or above required to register as moderator (proven track record first)
- Stake 500+ WORK to activate — stake is at risk on overturned verdicts
- Round-robin assignment from active pool
- Slashing: 10 WORK per overturned verdict; drops below threshold = auto-removed

### `job_escrow.move` — Core Escrow
- Client creates job with N milestones, each with title, description, APT amount, deadline
- Client funds each milestone separately (APT locked on-chain)
- Freelancer submits: uploads deliverable to IPFS → stores CID + Ed25519 wallet signature on-chain (cryptographic proof of authorship)
- Moderator assigned automatically on submission
- Moderator approves (payment released) or rejects (revision window, max 3)
- 2% platform fee deducted on release; tier discount applied
- WORK reward minted to freelancer: base amount + streak bonus

### `dispute.move` — Panel Arbitration
- Either party escalates after submission or rejection
- 3 moderators assigned from pool, vote independently
- Majority (2-of-3) determines outcome: release to freelancer or refund client
- Losing moderator's stake slashed

---

## Work Verification Flow

```
Freelancer completes work
        │
        ▼
Upload to IPFS (content-addressed, permanent)
        │
        ▼
Sign IPFS CID with wallet private key  ← cryptographic authorship proof
        │
        ▼
Submit: store CID + signature on-chain  ← immutable, timestamped
        │
        ▼
Moderator reviews deliverable at IPFS URL
        │
        ▼
Moderator writes assessment → uploads to IPFS → stores verdict CID on-chain
        │
        ├── Approved → payment released + WORK minted
        └── Rejected → revision window (max 3) or dispute escalation
```

---

## Tokenomics

| Parameter | Value |
|---|---|
| Token | WORK (Aptos Coin, 8 decimals) |
| Initial supply | 1,000,000 WORK |
| Reward per milestone | 10 WORK × milestone APT value |
| Streak bonus | +0.5% per 7-day streak tier |
| Platform fee | 2% of milestone value (APT) |
| Moderator stake min | 500 WORK |
| Slash per overturned verdict | 10 WORK |

**Tier thresholds (cumulative WORK earned):**

| Tier | WORK | Fee Discount | Unlock |
|---|---|---|---|
| Bronze | 0 | 0% | Standard access |
| Silver | 500 | 10% | Priority queue |
| Gold | 2,000 | 20% | Moderator eligibility |
| Platinum | 10,000 | 30% | Governance voting |

**Loyalty lock:** tier status requires holding minimum WORK. Spending drops tier → losing benefits creates a strong incentive to stay and accumulate rather than cash out.

---

## Stakeholders

| Role | Entry | Earns | Risk |
|---|---|---|---|
| Client | Register + fund milestones | Quality work, portable on-chain ratings as a client | Milestone locked until moderator verdicts |
| Freelancer | Register + register WORK | APT (milestone payout) + WORK rewards + reputation | Rejection, dispute, deadline slash |
| Moderator | Gold tier + stake 500 WORK | 1% of milestone value per assessment | Stake slashed if verdict overturned |
| Protocol | Deploy + set admin | 2% fee (minus tier discounts) to treasury | Smart contract bugs |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Aptos (Move VM) |
| Smart contracts | Move 2.0, Aptos Framework |
| Frontend | React 18, Vite |
| Wallet | Petra (Aptos native) |
| Web3 SDK | @aptos-labs/ts-sdk |
| File storage | IPFS (CID stored on-chain) |
| Work proof | Ed25519 wallet signature over IPFS CID |

---

## Setup

See [`scripts/deploy.md`](scripts/deploy.md) for full Aptos CLI deploy steps.

```bash
# Quick start
aptos init --network testnet
aptos move publish --named-addresses chainwork=<YOUR_ADDR>

# Frontend
cd frontend && npm install && npm run dev
```

Set `frontend/.env`:
```env
VITE_APTOS_NETWORK=testnet
VITE_MODULE_ADDR=0x<YOUR_ADDR>
VITE_ADMIN_ADDR=0x<YOUR_ADDR>
```
