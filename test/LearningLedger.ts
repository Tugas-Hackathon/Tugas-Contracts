import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, toHex, zeroHash } from "viem";

const { viem } = await network.create();

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
