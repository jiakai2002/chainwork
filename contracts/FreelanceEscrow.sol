// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./WorkToken.sol";
import "./ReputationSystem.sol";

/**
 * @title FreelanceEscrow  (v2 — with Disputes, WORK rewards, Reputation)
 *
 *  New in v2:
 *   • Dispute flow  : either party raises a dispute → arbitrator splits funds
 *   • WORK rewards  : freelancer earns WORK tokens on every completed job
 *   • Reputation    : completions / disputes / refunds recorded on-chain
 *
 *  School project talking points:
 *   • Multi-contract architecture (Escrow calls Token + Reputation)
 *   • 2-of-3 arbitration pattern (client, freelancer, arbitrator)
 *   • Token incentive layer on top of ETH payments
 */
contract FreelanceEscrow {

    // ─── Enums & Structs ─────────────────────────────────────────────────────

    enum JobStatus {
        Open,           // Created, funds locked
        WorkSubmitted,  // Freelancer submitted; awaiting client approval
        Disputed,       // Either party raised a dispute; arbitrator decides
        Completed,      // Payment released to freelancer
        Refunded        // Funds returned to client
    }

    struct Job {
        uint256   id;
        address payable client;
        address payable freelancer;
        string    title;
        string    description;
        uint256   payment;          // wei locked in escrow
        uint256   deadline;         // unix timestamp
        JobStatus status;
        string    workSubmission;   // deliverable reference
        address   arbitrator;       // who can resolve disputes for this job
    }

    // ─── Constants ───────────────────────────────────────────────────────────

    /// @notice WORK tokens minted to freelancer per completed job (10 WORK).
    uint256 public constant REWARD_PER_JOB = 10 * 10 ** 18;

    /// @notice Platform fee in basis points (200 = 2%). Sent to feeRecipient.
    uint256 public constant FEE_BPS = 200;

    // ─── State ────────────────────────────────────────────────────────────────

    uint256 private _jobCounter;

    mapping(uint256 => Job) public jobs;

    address public owner;
    address public feeRecipient;        // receives the 2% platform fee
    address public defaultArbitrator;   // fallback arbitrator for all jobs

    WorkToken        public workToken;
    ReputationSystem public reputation;

    // ─── Events ──────────────────────────────────────────────────────────────

    event JobCreated(uint256 indexed jobId, address indexed client,
                     string title, uint256 payment, uint256 deadline);
    event FreelancerAssigned(uint256 indexed jobId, address indexed freelancer);
    event WorkSubmitted(uint256 indexed jobId, address indexed freelancer,
                        string workSubmission);
    event DisputeRaised(uint256 indexed jobId, address indexed raisedBy);
    event DisputeResolved(uint256 indexed jobId, address indexed arbitrator,
                          uint256 clientShare, uint256 freelancerShare);
    event PaymentReleased(uint256 indexed jobId, address indexed freelancer,
                          uint256 amount);
    event JobRefunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event RewardMinted(uint256 indexed jobId, address indexed freelancer,
                       uint256 amount);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner()                { require(msg.sender == owner, "Only owner"); _; }
    modifier onlyClient(uint256 j)      { require(msg.sender == jobs[j].client,     "Only client"); _; }
    modifier onlyFreelancer(uint256 j)  { require(msg.sender == jobs[j].freelancer, "Only freelancer"); _; }
    modifier jobExists(uint256 j)       { require(jobs[j].client != address(0),     "No such job"); _; }

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param _workToken        Deployed WorkToken address.
     * @param _reputation       Deployed ReputationSystem address.
     * @param _defaultArbitrator Address that can resolve disputes by default.
     * @param _feeRecipient     Where the 2% platform fee goes.
     */
    constructor(
        address _workToken,
        address _reputation,
        address _defaultArbitrator,
        address _feeRecipient
    ) {
        owner             = msg.sender;
        workToken         = WorkToken(_workToken);
        reputation        = ReputationSystem(_reputation);
        defaultArbitrator = _defaultArbitrator;
        feeRecipient      = _feeRecipient;
    }

    // ─── Job lifecycle ────────────────────────────────────────────────────────

    /**
     * @notice Client creates a job and locks ETH in escrow.
     */
    function createJob(
        string   calldata title,
        string   calldata description,
        address  payable  freelancer,
        uint256           deadlineDays
    ) external payable returns (uint256 jobId) {
        require(msg.value > 0,           "Payment required");
        require(bytes(title).length > 0, "Title required");
        require(deadlineDays > 0,        "Deadline > 0 days");

        jobId = ++_jobCounter;

        jobs[jobId] = Job({
            id:             jobId,
            client:         payable(msg.sender),
            freelancer:     freelancer,
            title:          title,
            description:    description,
            payment:        msg.value,
            deadline:       block.timestamp + deadlineDays * 1 days,
            status:         JobStatus.Open,
            workSubmission: "",
            arbitrator:     defaultArbitrator
        });

        emit JobCreated(jobId, msg.sender, title, msg.value, jobs[jobId].deadline);
        if (freelancer != address(0)) emit FreelancerAssigned(jobId, freelancer);
    }

    /**
     * @notice Client assigns a freelancer post-creation.
     */
    function assignFreelancer(uint256 jobId, address payable freelancer)
        external jobExists(jobId) onlyClient(jobId)
    {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Open, "Job not open");
        require(freelancer != address(0),      "Invalid address");
        job.freelancer = freelancer;
        emit FreelancerAssigned(jobId, freelancer);
    }

    /**
     * @notice Freelancer submits work.
     */
    function submitWork(uint256 jobId, string calldata submission)
        external jobExists(jobId) onlyFreelancer(jobId)
    {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Open,     "Job not open");
        require(bytes(submission).length > 0,      "Submission required");
        require(block.timestamp <= job.deadline,   "Deadline passed");

        job.status         = JobStatus.WorkSubmitted;
        job.workSubmission = submission;
        emit WorkSubmitted(jobId, msg.sender, submission);
    }

    /**
     * @notice Client approves work → releases ETH + mints WORK reward.
     */
    function approvePayment(uint256 jobId)
        external jobExists(jobId) onlyClient(jobId)
    {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.WorkSubmitted, "Work not submitted");

        job.status = JobStatus.Completed;

        uint256 fee    = (job.payment * FEE_BPS) / 10_000;
        uint256 payout = job.payment - fee;

        emit PaymentReleased(jobId, job.freelancer, payout);

        // Pay freelancer (minus fee)
        job.freelancer.transfer(payout);

        // Pay platform fee
        if (fee > 0) payable(feeRecipient).transfer(fee);

        // Mint WORK reward to freelancer
        _mintReward(jobId, job.freelancer);

        // Record reputation
        reputation.recordCompletion(job.freelancer, job.client);
    }

    // ─── Dispute flow ─────────────────────────────────────────────────────────

    /**
     * @notice Either party raises a dispute after work is submitted.
     *         Funds are frozen until the arbitrator resolves.
     */
    function raiseDispute(uint256 jobId) external jobExists(jobId) {
        Job storage job = jobs[jobId];
        require(
            msg.sender == job.client || msg.sender == job.freelancer,
            "Not a party"
        );
        require(job.status == JobStatus.WorkSubmitted, "Can only dispute after submission");

        job.status = JobStatus.Disputed;
        emit DisputeRaised(jobId, msg.sender);

        // Record on reputation system
        reputation.recordDispute(job.freelancer, job.client);
    }

    /**
     * @notice Arbitrator resolves a dispute by splitting the escrow funds.
     * @param clientBps      Basis points (0–10000) awarded to client.
     *                       Freelancer receives the remainder.
     *                       e.g. clientBps=3000 → client 30%, freelancer 70%
     */
    function resolveDispute(uint256 jobId, uint256 clientBps)
        external jobExists(jobId)
    {
        Job storage job = jobs[jobId];
        require(msg.sender == job.arbitrator,        "Only arbitrator");
        require(job.status == JobStatus.Disputed,    "Not in dispute");
        require(clientBps <= 10_000,                 "Invalid split");

        job.status = JobStatus.Completed;

        uint256 total          = job.payment;
        uint256 clientShare    = (total * clientBps)          / 10_000;
        uint256 freelancerShare = total - clientShare;

        emit DisputeResolved(jobId, msg.sender, clientShare, freelancerShare);

        if (clientShare    > 0) job.client.transfer(clientShare);
        if (freelancerShare > 0) {
            job.freelancer.transfer(freelancerShare);
            // Partial reward: proportional to freelancer's share
            if (freelancerShare > total / 2) {
                _mintReward(jobId, job.freelancer);
            }
        }
    }

    // ─── Deadline resolution ──────────────────────────────────────────────────

    /**
     * @notice After deadline:
     *   - Work submitted but not approved → auto-release to freelancer
     *   - No work submitted → refund client
     */
    function resolveAfterDeadline(uint256 jobId) external jobExists(jobId) {
        Job storage job = jobs[jobId];
        require(block.timestamp > job.deadline, "Deadline not reached");

        if (job.status == JobStatus.WorkSubmitted) {
            require(
                msg.sender == job.freelancer || msg.sender == job.client,
                "Not authorized"
            );
            job.status = JobStatus.Completed;
            uint256 fee    = (job.payment * FEE_BPS) / 10_000;
            uint256 payout = job.payment - fee;
            emit PaymentReleased(jobId, job.freelancer, payout);
            job.freelancer.transfer(payout);
            if (fee > 0) payable(feeRecipient).transfer(fee);
            _mintReward(jobId, job.freelancer);
            reputation.recordCompletion(job.freelancer, job.client);

        } else if (job.status == JobStatus.Open) {
            require(msg.sender == job.client, "Only client");
            job.status = JobStatus.Refunded;
            uint256 amount = job.payment;
            emit JobRefunded(jobId, job.client, amount);
            reputation.recordRefund(job.freelancer, job.client);
            job.client.transfer(amount);

        } else {
            revert("Already resolved");
        }
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setDefaultArbitrator(address arb) external onlyOwner {
        defaultArbitrator = arb;
    }

    function setFeeRecipient(address rec) external onlyOwner {
        feeRecipient = rec;
    }

    // ─── Internals ────────────────────────────────────────────────────────────

    function _mintReward(uint256 jobId, address freelancer) internal {
        try workToken.mintReward(freelancer, REWARD_PER_JOB) {
            emit RewardMinted(jobId, freelancer, REWARD_PER_JOB);
        } catch {
            // If token minting fails (e.g. escrow not set yet), don't block payment
        }
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    function totalJobs() external view returns (uint256) {
        return _jobCounter;
    }
}
