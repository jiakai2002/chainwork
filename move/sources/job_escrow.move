/// job_escrow.move v3
/// Jobs stored in a global Table<u64, Job> at admin address.
/// Multiple jobs per client supported.
module chainwork::job_escrow {
    use std::signer;
    use std::string::{Self, String};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::coin;
    use aptos_framework::timestamp;
    use aptos_std::table::{Self, Table};
    use chainwork::work_token;
    use chainwork::reputation;
    use chainwork::moderator_pool;

    friend chainwork::dispute;

    // ── Errors ────────────────────────────────────────────────────────────────
    const E_NOT_CLIENT      : u64 = 1;
    const E_NOT_FREELANCER  : u64 = 2;
    const E_NOT_MODERATOR   : u64 = 3;
    const E_WRONG_STATUS    : u64 = 4;
    const E_INVALID_MILESTONE: u64 = 5;
    const E_DEADLINE_PASSED : u64 = 6;
    const E_ALREADY_FUNDED  : u64 = 7;
    const E_NOT_FUNDED      : u64 = 8;
    const E_MAX_REVISIONS   : u64 = 9;

    // ── Status ────────────────────────────────────────────────────────────────
    const STATUS_OPEN      : u8 = 0;
    const STATUS_SUBMITTED : u8 = 1;
    const STATUS_APPROVED  : u8 = 2;
    const STATUS_REJECTED  : u8 = 3;
    const STATUS_DISPUTED  : u8 = 4;
    const STATUS_REFUNDED  : u8 = 5;

    // ── Constants ─────────────────────────────────────────────────────────────
    const PLATFORM_FEE_BPS : u64 = 200;
    const WORK_PER_APT     : u64 = 10;
    const MAX_REVISIONS    : u64 = 3;
    const STREAK_BONUS_BPS : u64 = 50;

    // ── Structs ───────────────────────────────────────────────────────────────
    struct Milestone has store, drop {
        index:          u64,
        title:          String,
        description:    String,
        amount_apt:     u64,
        deadline_secs:  u64,
        status:         u8,
        ipfs_hash:      String,
        submission_sig: String,
        submitted_at:   u64,
        moderator:      address,
        verdict:        String,
        verdict_at:     u64,
        revision_count: u64,
    }

    struct Job has store {
        id:          u64,
        client:      address,
        freelancer:  address,
        title:       String,
        description: String,
        milestones:  vector<Milestone>,
        funds:       coin::Coin<AptosCoin>,
        admin_addr:  address,
    }

    // ── Global store at admin address ─────────────────────────────────────────
    struct JobStore has key {
        jobs:       Table<u64, Job>,
        next_id:    u64,
    }

    struct Treasury has key {
        admin: address,
        funds: coin::Coin<AptosCoin>,
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    public entry fun initialize(admin: &signer) {
        move_to(admin, JobStore {
            jobs:    table::new(),
            next_id: 1,
        });
        move_to(admin, Treasury {
            admin: signer::address_of(admin),
            funds: coin::zero<AptosCoin>(),
        });
    }

    // ── Create job ────────────────────────────────────────────────────────────
    public entry fun create_job(
        client:                &signer,
        freelancer:            address,
        title:                 String,
        description:           String,
        milestone_titles:      vector<String>,
        milestone_descs:       vector<String>,
        milestone_amounts_apt: vector<u64>,
        milestone_deadlines:   vector<u64>,
        admin_addr:            address,
    ) acquires JobStore {
        let client_addr = signer::address_of(client);
        let n = std::vector::length(&milestone_titles);
        assert!(n > 0 && n == std::vector::length(&milestone_amounts_apt), E_INVALID_MILESTONE);

        let store   = borrow_global_mut<JobStore>(admin_addr);
        let job_id  = store.next_id;
        store.next_id = store.next_id + 1;

        let milestones: vector<Milestone> = std::vector::empty();
        let i = 0;
        while (i < n) {
            std::vector::push_back(&mut milestones, Milestone {
                index:          i,
                title:          *std::vector::borrow(&milestone_titles, i),
                description:    *std::vector::borrow(&milestone_descs, i),
                amount_apt:     *std::vector::borrow(&milestone_amounts_apt, i),
                deadline_secs:  *std::vector::borrow(&milestone_deadlines, i),
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

        table::add(&mut store.jobs, job_id, Job {
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

    // ── Fund milestone ─────────────────────────────────────────────────────────
    public entry fun fund_milestone(
        client:          &signer,
        job_id:          u64,
        milestone_index: u64,
        admin_addr:      address,
    ) acquires JobStore {
        let client_addr = signer::address_of(client);
        let store = borrow_global_mut<JobStore>(admin_addr);
        let job   = table::borrow_mut(&mut store.jobs, job_id);
        assert!(job.client == client_addr, E_NOT_CLIENT);
        let m = std::vector::borrow(&job.milestones, milestone_index);
        let amount = m.amount_apt;
        let coins = coin::withdraw<AptosCoin>(client, amount);
        coin::merge(&mut job.funds, coins);
    }

    // ── Submit work ────────────────────────────────────────────────────────────
    public entry fun submit_work(
        freelancer:      &signer,
        job_id:          u64,
        milestone_index: u64,
        ipfs_hash:       String,
        sig:             String,
        admin_addr:      address,
    ) acquires JobStore {
        let fl_addr = signer::address_of(freelancer);
        let store   = borrow_global_mut<JobStore>(admin_addr);
        let job     = table::borrow_mut(&mut store.jobs, job_id);
        assert!(job.freelancer == fl_addr, E_NOT_FREELANCER);

        let m = std::vector::borrow_mut(&mut job.milestones, milestone_index);
        assert!(m.status == STATUS_OPEN || m.status == STATUS_REJECTED, E_WRONG_STATUS);
        assert!(timestamp::now_seconds() <= m.deadline_secs, E_DEADLINE_PASSED);
        assert!(m.revision_count < MAX_REVISIONS, E_MAX_REVISIONS);

        m.ipfs_hash      = ipfs_hash;
        m.submission_sig = sig;
        m.submitted_at   = timestamp::now_seconds();
        m.status         = STATUS_SUBMITTED;

        let size = moderator_pool::pool_size(admin_addr);
        let moderator = if (size > 0) {
            moderator_pool::assign_next(admin_addr)
        } else {
            admin_addr
        };
        m.moderator = moderator;
        reputation::record_assessment(moderator);
    }

    // ── Approve milestone ──────────────────────────────────────────────────────
    public entry fun approve_milestone(
        moderator:       &signer,
        job_id:          u64,
        milestone_index: u64,
        verdict_ipfs:    String,
        admin_addr:      address,
    ) acquires JobStore, Treasury {
        let client_addr = signer::address_of(moderator); // param reused as client signer
        let store    = borrow_global_mut<JobStore>(admin_addr);
        let job      = table::borrow_mut(&mut store.jobs, job_id);
        assert!(job.client == client_addr, E_NOT_CLIENT);
        let m        = std::vector::borrow_mut(&mut job.milestones, milestone_index);
        assert!(m.status == STATUS_SUBMITTED, E_WRONG_STATUS);

        m.verdict    = verdict_ipfs;
        m.verdict_at = timestamp::now_seconds();
        m.status     = STATUS_APPROVED;

        let total        = m.amount_apt;
        let fee          = (total * PLATFORM_FEE_BPS) / 10000;
        let payout       = total - fee;
        let freelancer   = job.freelancer;
        let client       = job.client;

        let payout_coins = coin::extract(&mut job.funds, payout);
        coin::deposit<AptosCoin>(freelancer, payout_coins);
        let fee_coins = coin::extract(&mut job.funds, fee);
        let treasury  = borrow_global_mut<Treasury>(admin_addr);
        coin::merge(&mut treasury.funds, fee_coins);

        let base_work    = total * WORK_PER_APT;
        let streak       = reputation::streak_days(freelancer);
        let streak_bonus = (base_work * (streak / 7) * STREAK_BONUS_BPS) / 10000;
        let total_work   = base_work + streak_bonus;
        // Mint WORK tokens to freelancer using deployer's stored Caps
        work_token::mint_to(admin_addr, freelancer, total_work);
        reputation::record_milestone_complete(freelancer, total_work);
        reputation::record_job_completed(client);
    }

    // ── Reject milestone — client rejects → auto raises dispute ──────────────
    public entry fun reject_milestone(
        client_signer:   &signer,
        job_id:          u64,
        milestone_index: u64,
        verdict_ipfs:    String,
        admin_addr:      address,
    ) acquires JobStore {
        let client_addr = signer::address_of(client_signer);
        let store    = borrow_global_mut<JobStore>(admin_addr);
        let job      = table::borrow_mut(&mut store.jobs, job_id);
        assert!(job.client == client_addr, E_NOT_CLIENT);
        let m        = std::vector::borrow_mut(&mut job.milestones, milestone_index);
        assert!(m.status == STATUS_SUBMITTED, E_WRONG_STATUS);

        m.verdict        = verdict_ipfs;
        m.verdict_at     = timestamp::now_seconds();
        m.revision_count = m.revision_count + 1;
        // Auto-raise dispute so moderator (admin) must resolve
        m.status         = STATUS_DISPUTED;
        reputation::record_milestone_disputed(job.freelancer);
        reputation::record_dispute_raised(job.client);
    }

    // ── Raise dispute ──────────────────────────────────────────────────────────
    public entry fun raise_dispute(
        caller:          &signer,
        job_id:          u64,
        milestone_index: u64,
        admin_addr:      address,
    ) acquires JobStore {
        let caller_addr = signer::address_of(caller);
        let store = borrow_global_mut<JobStore>(admin_addr);
        let job   = table::borrow_mut(&mut store.jobs, job_id);
        assert!(caller_addr == job.client || caller_addr == job.freelancer, E_NOT_CLIENT);

        let m = std::vector::borrow_mut(&mut job.milestones, milestone_index);
        assert!(m.status == STATUS_SUBMITTED || m.status == STATUS_REJECTED, E_WRONG_STATUS);
        m.status = STATUS_DISPUTED;

        reputation::record_milestone_disputed(job.freelancer);
        reputation::record_dispute_raised(job.client);
    }

    // ── Dispute panel resolves (called by dispute.move) ─────────────────────
    public(friend) fun resolve_dispute(
        job_id:          u64,
        milestone_index: u64,
        release_to_freelancer: bool,
        admin_addr:      address,
    ) acquires JobStore, Treasury {
        let store = borrow_global_mut<JobStore>(admin_addr);
        let job   = table::borrow_mut(&mut store.jobs, job_id);
        let m     = std::vector::borrow_mut(&mut job.milestones, milestone_index);
        assert!(m.status == STATUS_DISPUTED, E_WRONG_STATUS);
        let amount     = m.amount_apt;
        let freelancer = job.freelancer;
        let client     = job.client;
        if (release_to_freelancer) {
            let fee          = (amount * PLATFORM_FEE_BPS) / 10000;
            let payout_coins = coin::extract(&mut job.funds, amount - fee);
            coin::deposit<AptosCoin>(freelancer, payout_coins);
            let fee_coins = coin::extract(&mut job.funds, fee);
            let treasury  = borrow_global_mut<Treasury>(admin_addr);
            coin::merge(&mut treasury.funds, fee_coins);
            m.status = STATUS_APPROVED;
        } else {
            let coins = coin::extract(&mut job.funds, amount);
            coin::deposit<AptosCoin>(client, coins);
            m.status = STATUS_REFUNDED;
        };
    }

    // ── Admin resolve dispute ─────────────────────────────────────────────────
    public entry fun admin_resolve_dispute(
        admin:           &signer,
        job_id:          u64,
        milestone_index: u64,
        release_to_freelancer: bool,
        admin_addr:      address,
    ) acquires JobStore, Treasury {
        // Any moderator can resolve disputes
        let store = borrow_global_mut<JobStore>(admin_addr);
        let job   = table::borrow_mut(&mut store.jobs, job_id);
        let m     = std::vector::borrow_mut(&mut job.milestones, milestone_index);
        assert!(m.status == STATUS_DISPUTED, E_WRONG_STATUS);

        let amount     = m.amount_apt;
        let freelancer = job.freelancer;
        let client     = job.client;

        if (release_to_freelancer) {
            let fee          = (amount * PLATFORM_FEE_BPS) / 10000;
            let payout       = amount - fee;
            let payout_coins = coin::extract(&mut job.funds, payout);
            coin::deposit<AptosCoin>(freelancer, payout_coins);
            let fee_coins = coin::extract(&mut job.funds, fee);
            let treasury  = borrow_global_mut<Treasury>(admin_addr);
            coin::merge(&mut treasury.funds, fee_coins);
            m.status = STATUS_APPROVED;
        } else {
            let coins = coin::extract(&mut job.funds, amount);
            coin::deposit<AptosCoin>(client, coins);
            m.status = STATUS_REFUNDED;
        };
    }

    // ── Rate freelancer ────────────────────────────────────────────────────────
    public entry fun rate_freelancer(
        client:          &signer,
        job_id:          u64,
        milestone_index: u64,
        stars:           u64,
        admin_addr:      address,
    ) acquires JobStore {
        let client_addr = signer::address_of(client);
        let store = borrow_global<JobStore>(admin_addr);
        let job   = table::borrow(&store.jobs, job_id);
        assert!(job.client == client_addr, E_NOT_CLIENT);
        let m = std::vector::borrow(&job.milestones, milestone_index);
        assert!(m.status == STATUS_APPROVED, E_WRONG_STATUS);
        reputation::add_rating(job.freelancer, stars);
    }

    // ── Views ──────────────────────────────────────────────────────────────────
    #[view]
    public fun total_jobs(admin_addr: address): u64 acquires JobStore {
        borrow_global<JobStore>(admin_addr).next_id - 1
    }
}
