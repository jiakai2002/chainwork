const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("FreelanceEscrow", function () {
  let escrow, client, freelancer, other;

  beforeEach(async () => {
    [client, freelancer, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("FreelanceEscrow");
    escrow = await Factory.deploy();
    await escrow.waitForDeployment();
  });

  // ── helpers ──────────────────────────────────────────────────────────────

  async function createJob(deadlineDays = 7, value = ethers.parseEther("1")) {
    const tx = await escrow.connect(client).createJob(
      "Test Job",
      "A description",
      freelancer.address,
      deadlineDays,
      { value }
    );
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((l) => { try { return escrow.interface.parseLog(l); } catch { return null; } })
      .find((e) => e && e.name === "JobCreated");
    return event.args.jobId;
  }

  // ── tests ─────────────────────────────────────────────────────────────────

  it("creates a job and locks funds", async () => {
    const jobId = await createJob();
    const job = await escrow.getJob(jobId);
    expect(job.payment).to.equal(ethers.parseEther("1"));
    expect(job.status).to.equal(0n); // Open
  });

  it("freelancer submits work", async () => {
    const jobId = await createJob();
    await escrow.connect(freelancer).submitWork(jobId, "ipfs://Qm...");
    const job = await escrow.getJob(jobId);
    expect(job.status).to.equal(1n); // WorkSubmitted
    expect(job.workSubmission).to.equal("ipfs://Qm...");
  });

  it("client approves and freelancer receives payment", async () => {
    const jobId = await createJob();
    await escrow.connect(freelancer).submitWork(jobId, "ipfs://Qm...");

    const before = await ethers.provider.getBalance(freelancer.address);
    await escrow.connect(client).approvePayment(jobId);
    const after = await ethers.provider.getBalance(freelancer.address);

    expect(after - before).to.be.closeTo(
      ethers.parseEther("1"),
      ethers.parseEther("0.01") // gas tolerance
    );
    const job = await escrow.getJob(jobId);
    expect(job.status).to.equal(2n); // Completed
  });

  it("client can refund after deadline if no work submitted", async () => {
    const jobId = await createJob(1); // 1-day deadline

    // Fast-forward time past deadline
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);

    const before = await ethers.provider.getBalance(client.address);
    await escrow.connect(client).resolveAfterDeadline(jobId);
    const after = await ethers.provider.getBalance(client.address);

    expect(after - before).to.be.closeTo(
      ethers.parseEther("1"),
      ethers.parseEther("0.01")
    );
  });

  it("auto-releases to freelancer after deadline if work was submitted", async () => {
    const jobId = await createJob(1);
    await escrow.connect(freelancer).submitWork(jobId, "ipfs://Qm...");

    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);

    const before = await ethers.provider.getBalance(freelancer.address);
    await escrow.connect(freelancer).resolveAfterDeadline(jobId);
    const after = await ethers.provider.getBalance(freelancer.address);

    expect(after - before).to.be.closeTo(
      ethers.parseEther("1"),
      ethers.parseEther("0.01")
    );
  });

  it("rejects unauthorized work submission", async () => {
    const jobId = await createJob();
    await expect(
      escrow.connect(other).submitWork(jobId, "ipfs://Qm...")
    ).to.be.revertedWith("Only the assigned freelancer");
  });
});
