const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. WorkToken  (1,000,000 initial supply to deployer)
  const Token = await ethers.getContractFactory("WorkToken");
  const token = await Token.deploy(1_000_000);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("WorkToken deployed to:        ", tokenAddr);

  // 2. ReputationSystem
  const Rep = await ethers.getContractFactory("ReputationSystem");
  const rep = await Rep.deploy();
  await rep.waitForDeployment();
  const repAddr = await rep.getAddress();
  console.log("ReputationSystem deployed to: ", repAddr);

  // 3. FreelanceEscrow  (arbitrator = deployer for local testing)
  const Escrow = await ethers.getContractFactory("FreelanceEscrow");
  const escrow = await Escrow.deploy(
    tokenAddr,      // WorkToken
    repAddr,        // ReputationSystem
    deployer.address, // defaultArbitrator
    deployer.address  // feeRecipient
  );
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log("FreelanceEscrow deployed to:  ", escrowAddr);

  // 4. Wire up permissions
  //    • Token  → only escrow can mint rewards
  //    • Rep    → only escrow can record outcomes
  await (await token.setEscrow(escrowAddr)).wait();
  console.log("WorkToken escrow set ✓");
  await (await rep.setEscrow(escrowAddr)).wait();
  console.log("ReputationSystem escrow set ✓");

  // 5. Write addresses + ABIs to frontend
  const contracts = { WorkToken: tokenAddr, ReputationSystem: repAddr, FreelanceEscrow: escrowAddr };

  const abiDir  = path.join(__dirname, "../frontend/src/services");
  fs.mkdirSync(abiDir, { recursive: true });

  for (const [name, address] of Object.entries(contracts)) {
    const artifact = JSON.parse(fs.readFileSync(
      path.join(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`), "utf8"
    ));
    fs.writeFileSync(
      path.join(abiDir, `${name}.json`),
      JSON.stringify({ address, abi: artifact.abi }, null, 2)
    );
  }

  // Also write a combined addresses file for easy import
  fs.writeFileSync(
    path.join(abiDir, "addresses.json"),
    JSON.stringify(contracts, null, 2)
  );

  console.log("\nAll contract info written to frontend/src/services/");
  console.log(JSON.stringify(contracts, null, 2));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
