// Deploys LearningLedger, waits for the receipt, and writes
// deployments.json + abi/LearningLedger.json for the frontend/backend.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { network } from "hardhat";

const { viem, networkName } = await network.create();
const client = await viem.getPublicClient();
const chainId = await client.getChainId();

console.log(`Deploying LearningLedger to ${networkName} (chain ${chainId})...`);
const { contract: ledger, deploymentTransaction } = await viem.sendDeploymentTransaction("LearningLedger");
const receipt = await client.waitForTransactionReceipt({ hash: deploymentTransaction.hash, confirmations: 1 });
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
