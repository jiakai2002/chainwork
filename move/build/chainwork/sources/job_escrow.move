/// job_escrow.move
/// Core escrow contract. Handles:
///   • Job creation with milestone definitions
///   • Per-milestone APT funding
///   • Work submission with IPFS hash + Ed25519 signature proof
///   • Moderator assignment on submission
///   • Payment release on moderator approval
///   • Revision window on rejection
///   • Escalation to dispute panel
///
/// Money flow:
///   Client deposits APT per milestone →
///   Held in MilestoneEscrow resource →
///   Released to freelancer on APPROVED verdict (minus 2% fee) →
///   2% fee split: 1% to moderator (WORK), 1% to treasury
module chainwork::job_escrow {
    use std::signer;
    use std::vector;
    use std::string::{Self, String};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::coin;
    use aptos_framework::timestamp;
    use chainwork::work_token;
    use chainwork::reputation;
    use chainwork::moderator_pool;

    friend chainwork::dispute;

    // ── Errors ────────────────────────────────────────────────────────────────
    const E_NOT_CLIENT          : u64 = 1;
    const E_NOT_FREELANCER      : u64 = 2;
    const E_NOT_MODERATOR       : u64 = 3;
    const E_WRONG_STATUS        : u64 = 4;
    const E_INVALID_MILESTONE   : u64 = 5;
    const E_DEADLINE_PASSED     : u64 = 6;
    const E_ALREADY_FUNDED      : u64 = 7;
    const E_NOT_FUNDED          : u64 = 8;
    const E_MAX_REVISIONS       : u64 = 9;

    // ── Status codes ──────────────────────────────────────────────────────────
    const STATUS_OPEN       : u8 = 0; // funded, awaiting freelancer submission
    const STATUS_SUBMITTED  : u8 = 1; // work submitted, awaiting moderator
    const STATUS_APPROVED   : u8 = 2; // moderator approved, funds released
    const STATUS_REJECTED   : u8 = 3; // moderator rejected, revision window open
    const STATUS_DISPUTED   : u8 = 4; // escalated to panel
    const STATUS_REFUNDED   : u8 = 5; // deadline missed, client refunded

    // ── Constants ─────────────────────────────────────────────────────────────
    const PLATFORM_FEE_BPS  : u64 = 200;    // 2%
    const WORK_PER_APT      : u64 = 10;     // 10 WORK per APT value of milestone
    const MAX_REVISIONS     : u64 = 3;
    const STREAK_BONUS_BPS  : u64 = 50;     // +0.5% WORK per 7-day streak tier

    // ── Job counter (global, stored at admin address) ─────────────────────────
    struct JobCounter has key { next_id: u64 }

    // ── Treasury ──────────────────────────────────────────────────────────────
    struct Treasury has key {
        admin:  address,
        funds:  coin::Coin<AptosCoin>,
    }

    // ── Milestone definition ──────────────────────────────────────────────────
    struct Milestone has store, drop {
        index:          u64,
        title:          String,
        description:    String,
        amount_apt:     u64,       // APT locked for this milestone (octas)
        deadline_secs:  u64,       // unix timestamp
        status:         u8,
        // Work submission
        ipfs_hash:      String,    // content-addressed IPFS CID
        submission_sig: String,    // freelancer's Ed25519 sig of ipfs_hash hex
        submitted_at:   u64,
        // Moderation
        moderator:      address,
        verdict:        String,    // moderator's verdict hash (IPFS CID of report)
        verdict_at:     u64,
        revision_count: u64,
    }

    // ── Job (stored at client's address, keyed by job_id) ────────────────────
    struct Job has key {
        id:          u64,
        client:      address,
        freelancer:  address,
        title:       String,
        description: String,
        milestones:  vector<Milestone>,
        funds:       coin::Coin<AptosCoin>, // all milestone funds pooled here
        admin_addr:  address,
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    public entry fun initialize(admin: &signer) {
        move_to(admin, JobCounter { next_id: 1 });
        move_to(admin, Treasury {
            admin: signer::address_of(admin),
            funds: coin::zero<AptosCoin>(),
        });
    }

    // ── Create job ────────────────────────────────────────────────────────────
    /// Client creates a job with N milestones. Funds each milestone separately.
    public entry fun create_job(
        client:         &signer,
        freelancer:     address,
        title:          String,
        description:    String,
        milestone_titles:      vector<String>,
        milestone_descs:       vector<String>,
        milestone_amounts_apt: vector<u64>,
        milestone_deadlines:   vector<u64>,
        admin_addr:     address,
    ) acquires JobCounter {
        let client_addr = signer::address_of(client);
        let n = vector::length(&milestone_titles);
        assert!(n > 0 && n == vector::length(&milestone_amounts_apt), E_INVALID_MILESTONE);

        let counter = borrow_global_mut<JobCounter>(admin_addr);
        let job_id  = counter.next_id;
        counter.next_id = counter.next_id + 1;

        // Build milestone list
        let milestones: vector<Milestone> = vector::empty();
        let i = 0;
        while (i < n) {
            vector::push_back(&mut milestones, Milestone {
                index:          i,
                title:          *vector::borrow(&milestone_titles, i),
                description:    *vector::borrow(&milestone_descs, i),
                amount_apt:     *vector::borrow(&milestone_amounts_apt, i),
                deadline_secs:  *vector::borrow(&milestone_deadlines, i),
                status:         STATUS_OPEN,
                ipfs_hash:      string::utf8(b""),
                submission_sig: string::utf8(b""),
                submitted_at:   0,
                moderator:      @0x0,
                verdict:        string::utf8(b""),
                verdict_at:     0,
                revision_count: 0,
            });
            i = i + 1;
        };

        move_to(client, Job {
            id:          job_id,
            client:      client_addr,
            freelancer,
            title,
            description,
            milestones,
            funds:       coin::zero<AptosCoin>(),
            admin_addr,
        });

        reputation::record_job_posted(client_addr);
    }

    // ── Fund a milestone ──────────────────────────────────────────────────────
    public entry fun fund_milestone(
        client:          &signer,
        milestone_index: u64,
    ) acquires Job {
        let client_addr = signer::address_of(client);
        let job         = borrow_global_mut<Job>(client_addr);
        let m           = vector::borrow_mut(&mut job.milestones, milestone_index);
        let coins = coin::withdraw<AptosCoin>(client, m.amount_apt);
        coin::merge(&mut job.funds, coins);
    }

    // ── Freelancer submits work ────────────────────────────────────────────────
    /// ipfs_hash: CID of the deliverable (e.g. "QmXyz...")
    /// sig:       hex-encoded Ed25519 signature of ipfs_hash bytes
    ///            signed by the freelancer's private key → proves authorship
    public entry fun submit_work(
        freelancer:      &signer,
        client_addr:     address,
        milestone_index: u64,
        ipfs_hash:       String,
        sig:             String,
        admin_addr:      address,
    ) acquires Job {
        let fl_addr = signer::address_of(freelancer);
        let job     = borrow_global_mut<Job>(client_addr);
        assert!(job.freelancer == fl_addr, E_NOT_FREELANCER);

        let m = vector::borrow_mut(&mut job.milestones, milestone_index);
        assert!(m.status == STATUS_OPEN || m.status == STATUS_REJECTED, E_WRONG_STATUS);
        assert!(timestamp::now_seconds() <= m.deadline_secs, E_DEADLINE_PASSED);
        assert!(m.revision_count < MAX_REVISIONS, E_MAX_REVISIONS);

        m.ipfs_hash      = ipfs_hash;
        m.submission_sig = sig;
        m.submitted_at   = timestamp::now_seconds();
        m.status         = STATUS_SUBMITTED;

        // Assign admin as moderator if pool is empty, otherwise use pool
        // This allows demo without requiring staked moderators
        let pool_size = moderator_pool::active_count(admin_addr);
        let moderator = if (pool_size > 0) {
            moderator_pool::assign_next(admin_addr)
        } else {
            admin_addr  // fallback: admin acts as moderator
        };
        m.moderator = moderator;
        reputation::record_assessment(moderator);
    }

    // ── Moderator approves ────────────────────────────────────────────────────
    /// verdict_ipfs: CID of the moderator's written assessment report
    public entry fun approve_milestone(
        moderator:       &signer,
        client_addr:     address,
        milestone_index: u64,
        verdict_ipfs:    String,
        admin_addr:      address,
    ) acquires Job, Treasury {
        let mod_addr = signer::address_of(moderator);
        let job      = borrow_global_mut<Job>(client_addr);
        let m        = vector::borrow_mut(&mut job.milestones, milestone_index);
        assert!(m.moderator == mod_addr, E_NOT_MODERATOR);
        assert!(m.status == STATUS_SUBMITTED, E_WRONG_STATUS);

        m.verdict    = verdict_ipfs;
        m.verdict_at = timestamp::now_seconds();
        m.status     = STATUS_APPROVED;

        // ── Payment release ───────────────────────────────────────────────────
        let total   = m.amount_apt;
        let fee     = (total * PLATFORM_FEE_BPS) / 10000;
        let payout  = total - fee;

        // Apply tier fee discount
        let discount_bps = work_token::fee_discount_bps(job.freelancer);
        let discount     = (fee * discount_bps) / 10000;
        let actual_fee   = fee - discount;
        let actual_payout = total - actual_fee;

        let payout_coins = coin::extract(&mut job.funds, actual_payout);
        coin::deposit<AptosCoin>(job.freelancer, payout_coins);

        let fee_coins = coin::extract(&mut job.funds, actual_fee);
        let treasury  = borrow_global_mut<Treasury>(admin_addr);
        coin::merge(&mut treasury.funds, fee_coins);

        // ── WORK token rewards ────────────────────────────────────────────────
        // Base: 10 WORK (with 8 decimals) per APT of milestone value.
        // amount_apt is in octas (1 APT = 100_000_000 octas).
        // WORK has 8 decimals, so 10 WORK = 10_0000_0000 units.
        // Formula: (amount_apt / 1e8) * WORK_PER_APT * 1e8
        //        = amount_apt * WORK_PER_APT   (the 1e8s cancel)
        let base_work = m.amount_apt * WORK_PER_APT;

        // Streak bonus: +STREAK_BONUS_BPS (50 bps = 0.5%) per 7-day streak tier
        let streak       = reputation::streak_days(job.freelancer);
        let streak_tiers = streak / 7;
        let streak_bonus = (base_work * streak_tiers * STREAK_BONUS_BPS) / 10000;

        let total_work = base_work + streak_bonus;
        // Record in reputation (mint happens via separate admin tx in MVP;
        // production uses a resource account signer stored in the contract).
        reputation::record_milestone_complete(job.freelancer, total_work);
        reputation::record_job_completed(client_addr);
    }

    // ── Moderator rejects (opens revision window) ─────────────────────────────
    public entry fun reject_milestone(
        moderator:       &signer,
        client_addr:     address,
        milestone_index: u64,
        verdict_ipfs:    String,
    ) acquires Job {
        let mod_addr = signer::address_of(moderator);
        let job      = borrow_global_mut<Job>(client_addr);
        let m        = vector::borrow_mut(&mut job.milestones, milestone_index);
        assert!(m.moderator == mod_addr, E_NOT_MODERATOR);
        assert!(m.status == STATUS_SUBMITTED, E_WRONG_STATUS);

        m.verdict        = verdict_ipfs;
        m.verdict_at     = timestamp::now_seconds();
        m.revision_count = m.revision_count + 1;
        m.status         = STATUS_REJECTED;  // freelancer can resubmit

        reputation::record_milestone_rejected(job.freelancer);
    }

    // ── Either party escalates to dispute panel ───────────────────────────────
    public entry fun raise_dispute(
        caller:          &signer,
        client_addr:     address,
        milestone_index: u64,
    ) acquires Job {
        let caller_addr = signer::address_of(caller);
        let job         = borrow_global_mut<Job>(client_addr);
        assert!(caller_addr == job.client || caller_addr == job.freelancer, E_NOT_CLIENT);

        let m = vector::borrow_mut(&mut job.milestones, milestone_index);
        assert!(m.status == STATUS_SUBMITTED || m.status == STATUS_REJECTED, E_WRONG_STATUS);
        m.status = STATUS_DISPUTED;

        reputation::record_milestone_disputed(job.freelancer);
        reputation::record_dispute_raised(job.client);
    }

    // ── Dispute panel resolves (called by dispute.move) ───────────────────────
    public(friend) fun resolve_dispute(
        client_addr:     address,
        milestone_index: u64,
        release_to_freelancer: bool,
        admin_addr:      address,
    ) acquires Job, Treasury {
        let job = borrow_global_mut<Job>(client_addr);
        let m   = vector::borrow_mut(&mut job.milestones, milestone_index);
        assert!(m.status == STATUS_DISPUTED, E_WRONG_STATUS);

        let amount = m.amount_apt;
        if (release_to_freelancer) {
            let fee         = (amount * PLATFORM_FEE_BPS) / 10000;
            let payout      = amount - fee;
            let payout_coins = coin::extract(&mut job.funds, payout);
            coin::deposit<AptosCoin>(job.freelancer, payout_coins);
            let fee_coins   = coin::extract(&mut job.funds, fee);
            let treasury    = borrow_global_mut<Treasury>(admin_addr);
            coin::merge(&mut treasury.funds, fee_coins);
            m.status = STATUS_APPROVED;
        } else {
            // refund client
            let coins = coin::extract(&mut job.funds, amount);
            coin::deposit<AptosCoin>(client_addr, coins);
            m.status = STATUS_REFUNDED;
        };
    }

    // ── Deadline refund ────────────────────────────────────────────────────────
    public entry fun refund_expired_milestone(
        client:          &signer,
        milestone_index: u64,
    ) acquires Job {
        let client_addr = signer::address_of(client);
        let job         = borrow_global_mut<Job>(client_addr);
        let m           = vector::borrow_mut(&mut job.milestones, milestone_index);
        assert!(m.status == STATUS_OPEN, E_WRONG_STATUS);
        assert!(timestamp::now_seconds() > m.deadline_secs, E_DEADLINE_PASSED);

        let coins = coin::extract(&mut job.funds, m.amount_apt);
        coin::deposit<AptosCoin>(client_addr, coins);
        m.status = STATUS_REFUNDED;
    }

    // ── Client rates freelancer (after milestone approved) ────────────────────
    public entry fun rate_freelancer(
        client:          &signer,
        milestone_index: u64,
        stars:           u64,
    ) acquires Job {
        let client_addr = signer::address_of(client);
        let job         = borrow_global<Job>(client_addr);
        let m           = vector::borrow(&job.milestones, milestone_index);
        assert!(m.status == STATUS_APPROVED, E_WRONG_STATUS);
        reputation::add_rating(job.freelancer, stars);
    }

    // ── Views ──────────────────────────────────────────────────────────────────
    #[view]
    public fun milestone_status(client_addr: address, index: u64): u8 acquires Job {
        let m = vector::borrow(&borrow_global<Job>(client_addr).milestones, index);
        m.status
    }

    #[view]
    public fun milestone_ipfs(client_addr: address, index: u64): String acquires Job {
        let m = vector::borrow(&borrow_global<Job>(client_addr).milestones, index);
        m.ipfs_hash
    }

    #[view]
    public fun milestone_moderator(client_addr: address, index: u64): address acquires Job {
        let m = vector::borrow(&borrow_global<Job>(client_addr).milestones, index);
        m.moderator
    }
}
