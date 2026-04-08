# Deploying ChainWork v2 to Aptos

## Prerequisites

```bash
# Install Aptos CLI
curl -fsSL "https://aptos.dev/scripts/install_cli.py" | python3
# OR on mac
brew install aptos

# Verify
aptos --version
```

---

## 1. Create & Fund a Deployer Account

```bash
# Generate a new account (saves key to .aptos/config.yaml)
aptos init --network testnet

# Fund via faucet (testnet only)
aptos account fund-with-faucet --account default
```

Your deployer address is printed in `.aptos/config.yaml` under `account`.

---

## 2. Compile

```bash
cd move/

aptos move compile \
  --named-addresses chainwork=<YOUR_DEPLOYER_ADDRESS>
```

---

## 3. Publish

```bash
aptos move publish \
  --named-addresses chainwork=<YOUR_DEPLOYER_ADDRESS> \
  --assume-yes
```

Copy the module address from the output (same as your deployer address).

---

## 4. Initialise (one-time, run in order)

Each function stores the contract's global state on-chain. Must be called once after publishing.

```bash
export MOD=<YOUR_DEPLOYER_ADDRESS>

# WorkToken — stores mint/burn/freeze caps
aptos move run --function-id ${MOD}::work_token::initialize --assume-yes

# Reputation — stores AuthorityKey
aptos move run --function-id ${MOD}::reputation::initialize --assume-yes

# ModeratorPool — creates the empty moderator pool
aptos move run --function-id ${MOD}::moderator_pool::initialize --assume-yes

# JobEscrow — stores Treasury and JobCounter
aptos move run --function-id ${MOD}::job_escrow::initialize --assume-yes
```

Verify all resources are present:

```bash
aptos account list --account $MOD
```

You should see:
- `work_token::Caps`
- `job_escrow::Treasury`
- `job_escrow::JobCounter`
- `reputation::AuthorityKey`
- `moderator_pool::ModeratorPool`
- `coin::CoinInfo<...::WorkToken>`

---

## 5. Smoke Test

Register yourself as a freelancer to confirm the stack is live:

```bash
aptos move run \
  --function-id ${MOD}::work_token::register \
  --assume-yes

aptos move run \
  --function-id ${MOD}::reputation::register_freelancer \
  --assume-yes

aptos move run \
  --function-id ${MOD}::reputation::register_client \
  --assume-yes
```

---

## 6. Configure the Frontend

Create `frontend/.env`:

```env
VITE_APTOS_NETWORK=testnet
VITE_MODULE_ADDR=0x<YOUR_DEPLOYER_ADDRESS>
VITE_ADMIN_ADDR=0x<YOUR_DEPLOYER_ADDRESS>
```

Start the frontend:

```bash
cd frontend/
npm install
npm run dev
# → http://localhost:5173
```

---

## 7. Petra Wallet Setup

1. Install [Petra Wallet](https://petra.app/) Chrome extension
2. Create or import an account
3. Switch network to **Testnet**
4. Fund via [Aptos faucet](https://aptoslabs.com/testnet-faucet)

Import a second account (freelancer) for testing the full flow.

---

## 8. Demo Flow

| Step | Who | Action |
|---|---|---|
| 1 | Both | Register WORK coin + freelancer/client reputation resources |
| 2 | Client | Create job with milestones via frontend |
| 3 | Client | Fund each milestone (locks APT in escrow) |
| 4 | Freelancer | Upload deliverable → IPFS hash + wallet signature submitted on-chain |
| 5 | Moderator | Reviews work → submits verdict (approve or reject) with IPFS report |
| 6 | On approve | APT released to freelancer (minus 2% fee), WORK minted automatically |
| 7 | Dispute path | Either party escalates → 3-moderator panel votes (2-of-3 majority) |
| 8 | Client | Rate freelancer 1–5 stars after milestone approved |

---

## Module Addresses

```
${MOD}::work_token
${MOD}::reputation
${MOD}::moderator_pool
${MOD}::job_escrow
${MOD}::dispute
```

View on Aptos Explorer:
`https://explorer.aptoslabs.com/account/${MOD}/modules?network=testnet`
