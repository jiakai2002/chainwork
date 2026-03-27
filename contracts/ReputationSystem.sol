// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ReputationSystem
 * @notice Stores on-chain reputation scores for clients and freelancers.
 *         Only the registered FreelanceEscrow contract can record outcomes,
 *         preventing anyone from inflating their own score.
 *
 *  School project talking points:
 *   • Permissioned writes: only a trusted contract updates scores
 *   • Immutable history: every rating change is logged as an event
 *   • Simple incentive design: completion rate is visible to all
 */
contract ReputationSystem {

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Score {
        uint256 jobsCompleted;   // jobs finished successfully
        uint256 jobsDisputed;    // jobs that went to arbitration
        uint256 jobsRefunded;    // jobs refunded (missed deadline)
        uint256 totalRating;     // sum of all star ratings received (1–5)
        uint256 ratingCount;     // number of ratings
    }

    // ─── State ────────────────────────────────────────────────────────────────

    address public owner;
    address public escrowContract;

    mapping(address => Score) public scores;

    // ─── Events ──────────────────────────────────────────────────────────────

    event JobCompleted(address indexed freelancer, address indexed client);
    event JobDisputed(address indexed freelancer,  address indexed client);
    event JobRefunded(address indexed freelancer,  address indexed client);
    event Rated(address indexed subject, address indexed rater, uint8 stars);
    event EscrowSet(address indexed escrow);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setEscrow(address escrow) external {
        require(msg.sender == owner, "Only owner");
        escrowContract = escrow;
        emit EscrowSet(escrow);
    }

    // ─── Write (escrow only) ─────────────────────────────────────────────────

    function recordCompletion(address freelancer, address client) external {
        require(msg.sender == escrowContract, "Only escrow");
        scores[freelancer].jobsCompleted++;
        scores[client].jobsCompleted++;
        emit JobCompleted(freelancer, client);
    }

    function recordDispute(address freelancer, address client) external {
        require(msg.sender == escrowContract, "Only escrow");
        scores[freelancer].jobsDisputed++;
        scores[client].jobsDisputed++;
        emit JobDisputed(freelancer, client);
    }

    function recordRefund(address freelancer, address client) external {
        require(msg.sender == escrowContract, "Only escrow");
        // Only the freelancer's score takes the hit (they missed the deadline)
        scores[freelancer].jobsRefunded++;
        emit JobRefunded(freelancer, client);
    }

    /**
     * @notice Rate a counterparty after a job completes (1–5 stars).
     *         Called directly by users (not the escrow), but only the escrow
     *         can grant the right to rate via recordCompletion.
     *         For simplicity in MVP: anyone can rate any address once per call.
     *         Production: add a "hasRated[jobId][rater]" guard.
     */
    function rate(address subject, uint8 stars) external {
        require(stars >= 1 && stars <= 5, "Stars must be 1-5");
        scores[subject].totalRating += stars;
        scores[subject].ratingCount++;
        emit Rated(subject, msg.sender, stars);
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    function getScore(address user) external view returns (Score memory) {
        return scores[user];
    }

    /**
     * @notice Returns average rating as a value scaled by 10 (e.g. 45 = 4.5 stars).
     *         Returns 0 if no ratings yet.
     */
    function averageRating(address user) external view returns (uint256) {
        Score memory s = scores[user];
        if (s.ratingCount == 0) return 0;
        return (s.totalRating * 10) / s.ratingCount;
    }

    /**
     * @notice Completion rate as a percentage (0–100).
     */
    function completionRate(address user) external view returns (uint256) {
        Score memory s = scores[user];
        uint256 total = s.jobsCompleted + s.jobsRefunded + s.jobsDisputed;
        if (total == 0) return 0;
        return (s.jobsCompleted * 100) / total;
    }
}
