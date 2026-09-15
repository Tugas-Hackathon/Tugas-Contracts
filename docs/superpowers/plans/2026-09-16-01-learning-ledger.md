# Plan 01 — LearningLedger contract, tests, testnet deploy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested `LearningLedger.sol` deployed and verified on BOT Chain testnet (chain 968), with its address and ABI exported for the frontend.

**Architecture:** One Solidity contract with no dependencies and no constructor args (so bytecode is identical on testnet and mainnet). Hardhat 3 with the viem toolbox runs `node:test` tests against the built-in simulated network. A viem deploy script writes `deployments.json` and the ABI; `hardhat verify` talks to Blockscout on both explorers.

**Tech Stack:** Node 24, Hardhat 3.16, `@nomicfoundation/hardhat-toolbox-viem` 5, viem 2, Solidity 0.8.28, dotenv.

Spec: `docs/superpowers/specs/2026-09-16-tugas-design.md` §2, §4, §8.

---

## File structure

```
contracts/
  package.json              ESM ("type": "module"), scripts: test / compile / deploy:testnet / deploy:mainnet
  tsconfig.json
  hardhat.config.ts         plugins, solidity 0.8.28, networks from networks.json, chainDescriptors for verify
  networks.json             single source of truth for chain IDs / RPCs / explorers (copied to frontend later)
  .env.example              DEPLOYER_KEY=
  contracts/LearningLedger.sol
  test/LearningLedger.ts    node:test + viem assertions
  scripts/deploy.ts         deploys, waits for receipt, writes deployments.json + abi/LearningLedger.json
  deployments.json          { "<chainId>": { address, txHash, blockNumber } }  (committed)
  abi/LearningLedger.json   ABI array (committed)
```

All commands below run from `C:\Users\user\tugas\contracts` unless stated. Shell is PowerShell; `npx` works the same.

---

### Task 1: Scaffold the Hardhat project

**Files:**
- Create: `contracts/package.json`
- Create: `contracts/tsconfig.json`
- Create: `contracts/networks.json`
- Create: `contracts/hardhat.config.ts`
- Create: `contracts/.env.example`

- [ ] **Step 1: Create package.json and install**

```json
{
  "name": "tugas-contracts",
  "private": true,
  "type": "module",
  "scripts": {
    "compile": "hardhat compile",
    "test": "hardhat test",
    "deploy:testnet": "hardhat run scripts/deploy.ts --network testnet",
    "deploy:mainnet": "hardhat run scripts/deploy.ts --network mainnet"
  }
}
```

Run:
```bash
npm install --save-dev hardhat@3 @nomicfoundation/hardhat-toolbox-viem@5 typescript@5 @types/node dotenv
```
Expected: `node_modules/` created, no ERR lines. (`viem` comes in through the toolbox.)

- [ ] **Step 2: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["hardhat.config.ts", "test", "scripts"]
}
```

- [ ] **Step 3: networks.json (source of truth, verified live 2026-09-16)**

```json
{
  "mainnet": {
    "chainId": 677,
    "name": "BOT Chain Mainnet",
    "rpc": "https://rpc.botchain.ai",
    "explorer": "https://scan.botchain.ai",
    "symbol": "BOT"
  },
  "testnet": {
    "chainId": 968,
    "name": "BOT Chain Testnet",
    "rpc": "https://rpc.bohr.life",
    "explorer": "https://scan.bohr.life",
    "symbol": "tBOT"
  }
}
```

- [ ] **Step 4: hardhat.config.ts**

```ts
import "dotenv/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";
import networks from "./networks.json" with { type: "json" };

const explorer = (n: { name: string; explorer: string }) => ({
  name: n.name,
  blockExplorers: {
    blockscout: { name: "Blockscout", url: n.explorer, apiUrl: `${n.explorer}/api` },
  },
});

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    testnet: {
      type: "http",
      chainType: "l1",
      chainId: networks.testnet.chainId,
      url: networks.testnet.rpc,
      accounts: [configVariable("DEPLOYER_KEY")],
    },
    mainnet: {
      type: "http",
      chainType: "l1",
      chainId: networks.mainnet.chainId,
      url: networks.mainnet.rpc,
      accounts: [configVariable("DEPLOYER_KEY")],
    },
  },
  chainDescriptors: {
    [networks.testnet.chainId]: explorer(networks.testnet),
    [networks.mainnet.chainId]: explorer(networks.mainnet),
  },
  verify: {
    blockscout: { enabled: true },
    etherscan: { enabled: false },
  },
});
```

`configVariable` reads the env var by default; dotenv loads `.env`. Nothing else is needed.

- [ ] **Step 5: .env.example**

```
# 0x-prefixed private key of the deploy wallet. Fund with tBOT from https://faucet.botchain.ai/basic
DEPLOYER_KEY=
```

- [ ] **Step 6: Verify the config loads**

Run: `npx hardhat compile`
Expected: "Nothing to compile" or "Compiled 0 Solidity files" and exit code 0. If it errors on `verify` or `chainDescriptors` keys, check `node_modules/@nomicfoundation/hardhat-verify/README.md` for the 3.x key names and adjust; the two explorer URLs stay the same.

- [ ] **Step 7: Commit**

```bash
git add contracts/package.json contracts/package-lock.json contracts/tsconfig.json contracts/networks.json contracts/hardhat.config.ts contracts/.env.example
git commit -m "chore(contracts): scaffold Hardhat 3 project with BOT Chain networks"
```

---

### Task 2: `commit()` — tests first, then the contract

**Files:**
- Create: `contracts/test/LearningLedger.ts`
- Create: `contracts/contracts/LearningLedger.sol`

- [ ] **Step 1: Write the failing tests for commit**

```ts
// test/LearningLedger.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, toHex, zeroHash } from "viem";

const { viem } = await network.connect();

const WORK = keccak256(toHex("my draft"));
const CTX = keccak256(toHex("brief\nrubric"));

async function deploy() {
  const [student, teammate] = await viem.getWalletClients();
  const ledger = await viem.deployContract("LearningLedger");
  return { ledger, student, teammate };
}

describe("LearningLedger.commit", () => {
  it("stores the commit and emits MilestoneCommitted", async () => {
    const { ledger, student } = await deploy();
    await viem.assertions.emit(ledger.write.commit([WORK, CTX, 40]), ledger, "MilestoneCommitted");
    const c = await ledger.read.getCommit([0n]);
    assert.equal(c.student.toLowerCase(), student.account.address.toLowerCase());
    assert.equal(c.workHash, WORK);
    assert.equal(c.contextHash, CTX);
    assert.equal(c.aiAssistLevel, 40);
    assert.ok(c.timestamp > 0n);
    assert.equal(c.endorsements, 0);
  });

  it("increments ids and lists them in commitsOf", async () => {
    const { ledger, student } = await deploy();
    await ledger.write.commit([WORK, CTX, 10]);
    await ledger.write.commit([WORK, CTX, 20]);
    assert.equal(await ledger.read.totalCommits(), 2n);
    assert.deepEqual(await ledger.read.commitsOf([student.account.address]), [0n, 1n]);
  });

  it("reverts when aiAssistLevel > 100", async () => {
    const { ledger } = await deploy();
    await viem.assertions.revertWith(ledger.write.commit([WORK, CTX, 101]), "level>100");
  });

  it("reverts on zero workHash", async () => {
    const { ledger } = await deploy();
    await viem.assertions.revertWith(ledger.write.commit([zeroHash, CTX, 10]), "zero hash");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx hardhat test`
Expected: FAIL — compile/artifact error "LearningLedger not found" (no contract yet).

- [ ] **Step 3: Write the contract (commit + views only)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Proof-of-Learning ledger for Tugas. Stores only hashes; never content.
contract LearningLedger {
    struct Commit {
        address student;
        bytes32 workHash;      // keccak256 of the student's normalised draft
        bytes32 contextHash;   // keccak256 of brief + "\n" + rubric
        uint8 aiAssistLevel;   // 0-100, self-declared
        uint64 timestamp;
        uint32 endorsements;
    }

    event MilestoneCommitted(
        address indexed student,
        uint256 indexed id,
        bytes32 workHash,
        bytes32 contextHash,
        uint8 aiAssistLevel,
        uint64 timestamp
    );
    event Endorsed(uint256 indexed id, address indexed endorser);

    Commit[] private commits;
    mapping(address => uint256[]) private studentCommits;
    mapping(uint256 => mapping(address => bool)) public endorsed;

    function commit(bytes32 workHash, bytes32 contextHash, uint8 aiAssistLevel)
        external
        returns (uint256 id)
    {
        require(aiAssistLevel <= 100, "level>100");
        require(workHash != bytes32(0), "zero hash");
        id = commits.length;
        commits.push(Commit(msg.sender, workHash, contextHash, aiAssistLevel, uint64(block.timestamp), 0));
        studentCommits[msg.sender].push(id);
        emit MilestoneCommitted(msg.sender, id, workHash, contextHash, aiAssistLevel, uint64(block.timestamp));
    }

    function getCommit(uint256 id) external view returns (Commit memory) {
        require(id < commits.length, "no commit");
        return commits[id];
    }

    function commitsOf(address student) external view returns (uint256[] memory) {
        return studentCommits[student];
    }

    function totalCommits() external view returns (uint256) {
        return commits.length;
    }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx hardhat test`
Expected: 4 passing, 0 failing. If `network.connect` is reported deprecated in favour of `network.create`, switch the one line in the test file and keep going.

- [ ] **Step 5: Commit**

```bash
git add contracts/contracts/LearningLedger.sol contracts/test/LearningLedger.ts
git commit -m "feat(contracts): LearningLedger commit() with tests"
```

---

### Task 3: `endorse()` — tests first, then extend the contract

**Files:**
- Modify: `contracts/test/LearningLedger.ts` (append a describe block)
- Modify: `contracts/contracts/LearningLedger.sol` (add `endorse`)

- [ ] **Step 1: Append failing tests**

```ts
describe("LearningLedger.endorse", () => {
  it("lets a different wallet endorse once and emits Endorsed", async () => {
    const { ledger, teammate } = await deploy();
    await ledger.write.commit([WORK, CTX, 30]);
    await viem.assertions.emitWithArgs(
      ledger.write.endorse([0n], { account: teammate.account }),
      ledger,
      "Endorsed",
      [0n, teammate.account.address],
    );
    const c = await ledger.read.getCommit([0n]);
    assert.equal(c.endorsements, 1);
    assert.equal(await ledger.read.endorsed([0n, teammate.account.address]), true);
  });

  it("reverts on self-endorse", async () => {
    const { ledger } = await deploy();
    await ledger.write.commit([WORK, CTX, 30]);
    await viem.assertions.revertWith(ledger.write.endorse([0n]), "self");
  });

  it("reverts on double endorse", async () => {
    const { ledger, teammate } = await deploy();
    await ledger.write.commit([WORK, CTX, 30]);
    await ledger.write.endorse([0n], { account: teammate.account });
    await viem.assertions.revertWith(
      ledger.write.endorse([0n], { account: teammate.account }),
      "already",
    );
  });

  it("reverts on unknown id", async () => {
    const { ledger, teammate } = await deploy();
    await viem.assertions.revertWith(ledger.write.endorse([7n], { account: teammate.account }), "no commit");
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx hardhat test`
Expected: 4 passing, 4 failing (`endorse` is not a function / no such function).

- [ ] **Step 3: Add endorse to the contract** (insert after `commit`)

```solidity
    function endorse(uint256 id) external {
        require(id < commits.length, "no commit");
        Commit storage c = commits[id];
        require(c.student != msg.sender, "self");
        require(!endorsed[id][msg.sender], "already");
        endorsed[id][msg.sender] = true;
        c.endorsements += 1;
        emit Endorsed(id, msg.sender);
    }
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx hardhat test`
Expected: 8 passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add contracts/contracts/LearningLedger.sol contracts/test/LearningLedger.ts
git commit -m "feat(contracts): endorse() with self/double/unknown-id reverts"
```

---

### Task 4: Deploy script that exports address + ABI

**Files:**
- Create: `contracts/scripts/deploy.ts`
- Create (by running): `contracts/deployments.json`, `contracts/abi/LearningLedger.json`

- [ ] **Step 1: Write the script**

```ts
// scripts/deploy.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { network } from "hardhat";

const { viem, networkName } = await network.connect();
const client = await viem.getPublicClient();
const chainId = await client.getChainId();

console.log(`Deploying LearningLedger to ${networkName} (chain ${chainId})...`);
const ledger = await viem.deployContract("LearningLedger");
const receipt = await client.waitForTransactionReceipt({ hash: ledger.deploymentTransaction!.hash, confirmations: 1 });
console.log("LearningLedger:", ledger.address, "block", receipt.blockNumber.toString());

const file = "deployments.json";
const all = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
all[String(chainId)] = {
  address: ledger.address,
  txHash: receipt.transactionHash,
  blockNumber: Number(receipt.blockNumber),
  deployedAt: new Date().toISOString(),
};
writeFileSync(file, JSON.stringify(all, null, 2) + "\n");

mkdirSync("abi", { recursive: true });
writeFileSync("abi/LearningLedger.json", JSON.stringify(ledger.abi, null, 2) + "\n");
console.log("Wrote deployments.json and abi/LearningLedger.json");
```

If `ledger.deploymentTransaction` is undefined in this toolbox version, replace the two deploy lines with:
```ts
const { contract, deploymentTransaction } = await viem.sendDeploymentTransaction("LearningLedger");
const receipt = await client.waitForTransactionReceipt({ hash: deploymentTransaction.hash, confirmations: 1 });
const ledger = contract;
```

- [ ] **Step 2: Run against the simulated network (the check for this task)**

Run: `npx hardhat run scripts/deploy.ts`
Expected: prints an address, `deployments.json` now has key `"31337"`, `abi/LearningLedger.json` contains entries named `commit`, `endorse`, `MilestoneCommitted`.

Verify: `node -e "const d=require('./deployments.json');const a=require('./abi/LearningLedger.json');console.log(Object.keys(d), a.map(x=>x.name).filter(Boolean))"`
Expected: `[ '31337' ] [ 'MilestoneCommitted', 'Endorsed', 'commit', 'commitsOf', 'endorse', 'endorsed', 'getCommit', 'totalCommits' ]` (order may differ).

- [ ] **Step 3: Commit**

```bash
git add contracts/scripts/deploy.ts contracts/deployments.json contracts/abi/LearningLedger.json
git commit -m "feat(contracts): deploy script exporting deployments.json and ABI"
```

---

### Task 5: Testnet deploy + Blockscout verification (needs the user's wallet)

**Files:**
- Modify (by running): `contracts/deployments.json`
- Create locally, never committed: `contracts/.env`

- [ ] **Step 1: User action — deploy wallet**

Create a fresh MetaMask account for deployment only. Export its private key into `contracts/.env` as `DEPLOYER_KEY=0x...`. Get tBOT at https://faucet.botchain.ai/basic (10 tBOT / 24 h; one request is plenty). Confirm the balance:

Run: `node -e "fetch('https://rpc.bohr.life',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBalance',params:['<ADDRESS>','latest']})}).then(r=>r.json()).then(j=>console.log(BigInt(j.result)/10n**18n,'tBOT'))"`
Expected: a number ≥ 1.

- [ ] **Step 2: Deploy to testnet**

Run: `npm run deploy:testnet`
Expected: "Deploying LearningLedger to testnet (chain 968)…", an address, and `deployments.json` gains key `"968"`.

- [ ] **Step 3: Verify on Blockscout**

Run: `npx hardhat verify --network testnet <ADDRESS>`
Expected: "Successfully verified contract LearningLedger on Blockscout" and a link under https://scan.bohr.life/address/<ADDRESS>?tab=contract showing source.

If verification fails with an API error, the fallback is manual: on the explorer's Verify & Publish page choose "Solidity (single file)", compiler 0.8.28, optimizer on, 200 runs, paste `contracts/LearningLedger.sol`. Same bytecode, same result.

- [ ] **Step 4: Smoke a real commit on testnet (proves the hard requirement end-to-end from a script)**

```ts
// scripts/smoke.ts
import { network } from "hardhat";
import { keccak256, toHex } from "viem";
import deployments from "../deployments.json" with { type: "json" };

const { viem } = await network.connect();
const client = await viem.getPublicClient();
const chainId = String(await client.getChainId());
const address = (deployments as Record<string, { address: `0x${string}` }>)[chainId].address;
const ledger = await viem.getContractAt("LearningLedger", address);
const hash = await ledger.write.commit([keccak256(toHex("smoke")), keccak256(toHex("ctx")), 50]);
const r = await client.waitForTransactionReceipt({ hash });
console.log("tx", r.transactionHash, "total", (await ledger.read.totalCommits()).toString());
```

Run: `npx hardhat run scripts/smoke.ts --network testnet`
Expected: a tx hash and `total 1`; the tx is visible at https://scan.bohr.life/tx/<hash> with a `MilestoneCommitted` log.

- [ ] **Step 5: Commit**

```bash
git add contracts/deployments.json contracts/scripts/smoke.ts
git commit -m "chore(contracts): deploy LearningLedger to BOT Chain testnet (968)"
```

---

## Done when

- `npx hardhat test` → 8 passing.
- `deployments.json` has `"968"` with a verified address on scan.bohr.life.
- A smoke `commit` tx is visible on the testnet explorer.

Mainnet (`npm run deploy:mainnet`, then `npx hardhat verify --network mainnet <ADDRESS>`) is step 13 of the build order and needs real BOT in the deploy wallet; same commands, no code changes.
