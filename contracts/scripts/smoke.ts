// Sends one real commit() to the deployed ledger on the current network.
import { network } from "hardhat";
import { keccak256, toHex } from "viem";
import deployments from "../deployments.json" with { type: "json" };

const { viem } = await network.create();
const client = await viem.getPublicClient();
const chainId = String(await client.getChainId());
const entry = (deployments as Record<string, { address: `0x${string}` }>)[chainId];
if (!entry) throw new Error(`no deployment for chain ${chainId}; run deploy first`);

// On the simulated network nothing persists between runs, so deploy fresh there.
const ledger =
  chainId === "31337"
    ? await viem.deployContract("LearningLedger")
    : await viem.getContractAt("LearningLedger", entry.address);
const hash = await ledger.write.commit([keccak256(toHex("smoke")), keccak256(toHex("ctx")), 50]);
const r = await client.waitForTransactionReceipt({ hash });
console.log("tx", r.transactionHash, "total", (await ledger.read.totalCommits()).toString());
