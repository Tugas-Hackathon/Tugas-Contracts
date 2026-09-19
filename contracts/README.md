# Tugas — Contracts

`LearningLedger`, the on-chain half of **Tugas** — a student productivity OS that keeps an AI tutor honest by anchoring proof of a student's own work.

Deployed on **BOT Chain Testnet** (chain `968`):
[`0xE2c7c1c96F45de15D2cDBb02dfF1E18f97106A76`](https://scan.bohr.life/address/0xE2c7c1c96F45de15D2cDBb02dfF1E18f97106A76)

Pairs with [Tugas-Backend](https://github.com/Tugas-Hackathon/Tugas-Backend) and [Tugas-Frontend](https://github.com/Tugas-Hackathon/Tugas-Frontend).

---

## What it does

The contract stores **hashes only — never content.**

A student writes a draft. The backend computes `keccak256` of it, the student's own wallet calls `commit()`, and the hash lands on-chain with a block timestamp. The coursework itself never leaves their machine.

That gives the student something they couldn't get otherwise: the ability to prove *"this exact draft existed at this moment, and I declared I used AI for N% of it"* — without publishing the work, and without anyone having to trust Tugas's servers.

```solidity
struct Commit {
    address student;
    bytes32 workHash;      // keccak256 of the normalised draft
    bytes32 contextHash;   // keccak256 of brief + "\n" + rubric
    uint8   aiAssistLevel; // 0-100, self-declared
    uint64  timestamp;
    uint32  endorsements;
}
```

### Why hashes and not content

Putting coursework on a public chain would be an academic-integrity disaster — anyone could copy it, and the student would have published their own work before submitting it. A hash proves existence and timing while revealing nothing. If a dispute arises later, the student reveals the draft and anyone can recompute the hash and check it against the chain.

### Why `aiAssistLevel` is self-declared

There is no reliable way to detect AI-written text, and pretending otherwise would make the whole thing a lie. So the contract doesn't try. It records what the student *claims*, permanently and publicly, alongside the timestamped hash of the work. The value is accountability, not detection — a student who declares 10% and is later shown to have used far more has a signed, timestamped, immutable record of that claim.

### Why the draft is normalised before hashing

The backend lowercases and collapses whitespace before hashing. Without that, re-saving a file with different line endings or trailing spaces would produce a different hash for identical work — the proof would break on formatting noise rather than on actual changes.

---

## Interface

| Function | |
|---|---|
| `commit(bytes32 workHash, bytes32 contextHash, uint8 aiAssistLevel) → uint256 id` | Records a milestone. Reverts if `aiAssistLevel > 100` or `workHash` is zero. Emits `MilestoneCommitted`. |
| `endorse(uint256 id)` | Lets a peer vouch for a commit. Rejects self-endorsement and double-endorsement. Emits `Endorsed`. |
| `getCommit(uint256 id) → Commit` | Reads one commit. |
| `commitsOf(address student) → uint256[]` | All commit IDs for a student. |
| `totalCommits() → uint256` | Total count. |

```solidity
event MilestoneCommitted(
    address indexed student,
    uint256 indexed id,
    bytes32 workHash,
    bytes32 contextHash,
    uint8   aiAssistLevel,
    uint64  timestamp
);
event Endorsed(uint256 indexed id, address indexed endorser);
```

The backend watches `MilestoneCommitted` — it decodes `workHash` and `contextHash` out of the log data and refuses to record the anchor unless both match what it computed. See the [backend README](https://github.com/Tugas-Hackathon/Tugas-Backend#proof-of-learning-flow).

> `endorse`, `getCommit`, `commitsOf` and `totalCommits` are deployed but not yet called by the app — peer endorsement is built into the contract ahead of the UI for it.

---

## Stack

Hardhat 3 · viem toolbox · Solidity 0.8.28 (optimizer on, 200 runs) · TypeScript

---

## Setup

```bash
npm install
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `DEPLOYER_KEY` | 0x-prefixed private key of the deploy wallet. Fund with tBOT from the [faucet](https://faucet.botchain.ai/basic). |

> **`.env` is gitignored and must never be committed.** It holds a real private key — anything in it can drain the wallet.

```bash
npm run compile
npm test
npm run deploy:testnet
```

`scripts/smoke.ts` runs a commit against a live deployment as a post-deploy sanity check.

---

## Networks

Defined in `networks.json`, consumed by both `hardhat.config.ts` and the frontend.

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | `968` | `677` |
| RPC | `https://rpc.bohr.life` | `https://rpc.botchain.ai` |
| Explorer | `https://scan.bohr.life` | `https://scan.botchain.ai` |
| Symbol | tBOT | BOT |

Deployed addresses are recorded in `deployments.json`, keyed by chain ID.

Verification goes through Blockscout (`verify.blockscout.enabled`); Etherscan is off since BOT Chain doesn't use it.

---

## Layout

```
contracts/LearningLedger.sol   the contract
scripts/deploy.ts              deploy + record to deployments.json
scripts/smoke.ts               post-deploy sanity commit
test/LearningLedger.ts         hardhat tests
abi/LearningLedger.json        ABI consumed by the frontend
networks.json                  chain config shared with the frontend
deployments.json               deployed addresses by chain ID
```
