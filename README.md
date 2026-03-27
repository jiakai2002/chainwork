# ChainWork

> Decentralized freelance escrow platform built on Ethereum. Trustless payments, on-chain dispute resolution, token incentives, and reputation — no intermediaries.

---

## Overview

ChainWork replaces platforms like Upwork or Fiverr with a set of smart contracts. Clients lock payment in escrow at job creation; funds release automatically when work is approved or a deadline passes. Disputes are resolved by a neutral arbitrator who can split funds proportionally. Every action — payment, submission, dispute, rating — is recorded permanently on-chain.

**Built with:** Solidity · Hardhat · React 18 · ethers.js v6 · Vite · MetaMask

---

## Features

### Escrow Payments
Clients deposit ETH into the `FreelanceEscrow` contract at job creation. Funds are locked until one of three outcomes: client approval, deadline expiry, or arbitrator resolution. A 2% platform fee is deducted on release.

### Dispute Resolution
Either party can raise a dispute after work is submitted. A designated arbitrator resolves it by specifying a percentage split — e.g. 70% to freelancer, 30% to client — releasing funds accordingly. Disputes are logged as on-chain events.

### WORK Token Rewards
Freelancers earn **10 WORK** (ERC-20) on every completed job, on top of their ETH payment. Only the escrow contract can mint reward tokens, preventing manipulation. Token balance is displayed live in the UI.

### On-Chain Reputation
`ReputationSystem.sol` tracks `jobsCompleted`, `jobsDisputed`, and `jobsRefunded` per wallet. Users can leave 1–5 star ratings after job completion. Completion rate and average rating are readable by any contract or frontend.

### Wallet Authentication
MetaMask-based identity — no passwords, no accounts. All role-based access (client, freelancer, arbitrator) is enforced in Solidity by `msg.sender` checks.

---

## Smart Contracts

| Contract | Responsibility |
|---|---|
| `FreelanceEscrow.sol` | Job lifecycle, ETH escrow, fee collection, mints rewards, calls reputation hooks |
| `WorkToken.sol` | ERC-20 `WORK` token — controlled minting via `setEscrow()` |
| `ReputationSystem.sol` | Permissioned score tracking, star ratings, completion rate |

### Key Functions

| Function | Caller | Effect |
|---|---|---|
| `createJob(title, desc, freelancer, days)` | Client | Locks ETH, starts deadline |
| `submitWork(jobId, submission)` | Freelancer | Records deliverable hash on-chain |
| `approvePayment(jobId)` | Client | Releases ETH − 2% fee, mints 10 WORK |
| `raiseDispute(jobId)` | Either party | Freezes funds, flags for arbitration |
| `resolveDispute(jobId, clientBps)` | Arbitrator | Splits escrow by basis points |
| `resolveAfterDeadline(jobId)` | Either party | Auto-releases or refunds past deadline |
| `rate(address, stars)` | Anyone | Stores 1–5 star rating on-chain |

### Job State Machine

```
                    ┌─────────────────────────────────────┐
                    │                                     │
Open ──[submitWork]──▶ WorkSubmitted ──[approvePayment]──▶ Completed
  │                       │
  │                       └──[raiseDispute]──▶ Disputed ──[resolveDispute]──▶ Completed
  │
  └──[deadline, no work]──▶ Refunded
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | Solidity 0.8.19, Hardhat |
| Blockchain | Ethereum-compatible (local Hardhat / Sepolia testnet) |
| Frontend | React 18, Vite |
| Web3 library | ethers.js v6 |
| Wallet | MetaMask (EIP-1193) |
| Styling | Vanilla CSS |

---

## Project Structure

```
chainwork/
├── contracts/
│   ├── FreelanceEscrow.sol     # Core escrow + dispute + fee logic
│   ├── WorkToken.sol           # ERC-20 reward token
│   └── ReputationSystem.sol    # On-chain scores and ratings
├── frontend/src/
│   ├── services/blockchain.js  # All contract ABIs + ethers.js calls
│   ├── components/             # JobCard, DisputePanel, ReputationCard, TokenBadge
│   ├── pages/                  # Dashboard, CreateJob
│   └── App.jsx
├── scripts/
│   ├── deploy.js               # Deploys all 3 contracts, wires permissions
│   └── test.js                 # Hardhat test suite
└── hardhat.config.js
```

---

## Local Setup

**Prerequisites:** Node.js ≥ 18, MetaMask browser extension

```bash
# 1. Install dependencies
npm install && cd frontend && npm install && cd ..

# 2. Start local Ethereum node (terminal 1)
npx hardhat node

# 3. Deploy all contracts (terminal 2)
npm run deploy:local
# → Deploys WorkToken, ReputationSystem, FreelanceEscrow
# → Wires permissions between contracts
# → Writes addresses to frontend/src/services/addresses.json

# 4. Start frontend
npm run frontend
# → http://localhost:5173
```

**MetaMask setup** — add a custom network:

| Field | Value |
|---|---|
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency | `ETH` |

Then import Account #0 (client) and Account #1 (freelancer) using the private keys printed by `npx hardhat node`.

---

## Demo Walkthrough

| Step | Account | Action |
|---|---|---|
| 1 | Client (#0) | Create Job → deposit ETH |
| 2 | Freelancer (#1) | Submit Work → enter deliverable URL |
| 3a | Client (#0) | Approve Payment → ETH released, freelancer earns 10 WORK |
| 3b | Client (#0) | Raise Dispute → arbitrator resolves with % split |
| 4 | Either | View Reputation → leave star rating |

---

## Testnet Deployment (Sepolia)

```bash
# .env
SEPOLIA_RPC_URL=https://rpc.sepolia.org
PRIVATE_KEY=0x...

npm run deploy:sepolia
```

Get test ETH: [sepoliafaucet.com](https://sepoliafaucet.com)

---

## Running Tests

```bash
npm test
```

Covers: job creation, work submission, payment release, deadline refund, deadline auto-release, dispute flow, access control.
