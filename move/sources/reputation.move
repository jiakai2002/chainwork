/// reputation.move
/// On-chain reputation for freelancers, clients, and moderators.
/// Scores are owned resources attached to each account — they cannot
/// be transferred, faked, or platform-siloed.
///
/// Loyalty mechanics:
///   • streak_days counts consecutive active days — bonus WORK minted on streak milestones
///   • lifetime_earned accumulates forever — tier thresholds use this (not current balance)
///     so spending WORK doesn't demote you
///   • Churning resets streak but NOT lifetime score — your history is permanent
module chainwork::reputation {
    use std::signer;
    use aptos_framework::timestamp;

    friend chainwork::job_escrow;
    friend chainwork::moderator_pool;

    // ── Errors ────────────────────────────────────────────────────────────────
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_NOT_REGISTERED: u64 = 2;

    // ── Freelancer score ──────────────────────────────────────────────────────
    struct FreelancerScore has key {
        milestones_completed : u64,
        milestones_disputed  : u64,
        milestones_rejected  : u64,
        total_rating_points  : u64,   // sum of 1–5 star ratings × 100
        rating_count         : u64,
        lifetime_work_earned : u64,   // WORK ever minted (doesn't decrease)
        streak_days          : u64,   // consecutive days with completed milestone
        last_active_ts       : u64,   // unix seconds of last milestone completion
    }

    // ── Moderator score ───────────────────────────────────────────────────────
    struct ModeratorScore has key {
        assessments_total    : u64,
        assessments_overturned: u64,  // overturned by dispute panel
        stake_slashed_total  : u64,
        stake_balance        : u64,   // WORK staked (tracked here, held in escrow)
        is_active            : bool,
    }

    // ── Client score ──────────────────────────────────────────────────────────
    struct ClientScore has key {
        jobs_posted          : u64,
        jobs_completed       : u64,
        disputes_raised      : u64,
        disputes_lost        : u64,
    }

    // ── Who can write scores (module-level access control) ────────────────────
    struct AuthorityKey has key { admin: address }

    // ── Init ──────────────────────────────────────────────────────────────────
    public entry fun initialize(admin: &signer) {
        move_to(admin, AuthorityKey { admin: signer::address_of(admin) });
    }

    // Users call this to create their own score resource
    public entry fun register_freelancer(account: &signer) {
        move_to(account, FreelancerScore {
            milestones_completed: 0,
            milestones_disputed:  0,
            milestones_rejected:  0,
            total_rating_points:  0,
            rating_count:         0,
            lifetime_work_earned: 0,
            streak_days:          0,
            last_active_ts:       0,
        });
    }

    public entry fun register_moderator(account: &signer) {
        move_to(account, ModeratorScore {
            assessments_total:     0,
            assessments_overturned:0,
            stake_slashed_total:   0,
            stake_balance:         0,
            is_active:             false,
        });
    }

    public entry fun register_client(account: &signer) {
        move_to(account, ClientScore {
            jobs_posted:     0,
            jobs_completed:  0,
            disputes_raised: 0,
            disputes_lost:   0,
        });
    }

    // ── Freelancer writes (called by job_escrow or dispute modules) ────────────

    public(friend) fun record_milestone_complete(
        freelancer: address,
        work_earned: u64,
    ) acquires FreelancerScore {
        let s = borrow_global_mut<FreelancerScore>(freelancer);
        s.milestones_completed = s.milestones_completed + 1;
        s.lifetime_work_earned = s.lifetime_work_earned + work_earned;

        // Streak logic: if last active < 48 hours ago, increment streak
        let now = timestamp::now_seconds();
        let elapsed = now - s.last_active_ts;
        if (s.last_active_ts == 0 || elapsed <= 172800) {
            s.streak_days = s.streak_days + 1;
        } else {
            s.streak_days = 1; // reset but history is permanent
        };
        s.last_active_ts = now;
    }

    public(friend) fun record_milestone_disputed(freelancer: address) acquires FreelancerScore {
        borrow_global_mut<FreelancerScore>(freelancer).milestones_disputed =
            borrow_global<FreelancerScore>(freelancer).milestones_disputed + 1;
    }

    public(friend) fun record_milestone_rejected(freelancer: address) acquires FreelancerScore {
        borrow_global_mut<FreelancerScore>(freelancer).milestones_rejected =
            borrow_global<FreelancerScore>(freelancer).milestones_rejected + 1;
    }

    public(friend) fun add_rating(freelancer: address, stars: u64) acquires FreelancerScore {
        assert!(stars >= 1 && stars <= 5, 3);
        let s = borrow_global_mut<FreelancerScore>(freelancer);
        s.total_rating_points = s.total_rating_points + (stars * 100);
        s.rating_count        = s.rating_count + 1;
    }

    // ── Moderator writes ───────────────────────────────────────────────────────

    public(friend) fun record_assessment(moderator: address) acquires ModeratorScore {
        borrow_global_mut<ModeratorScore>(moderator).assessments_total =
            borrow_global<ModeratorScore>(moderator).assessments_total + 1;
    }

    public(friend) fun record_overturned(moderator: address, slash: u64) acquires ModeratorScore {
        let s = borrow_global_mut<ModeratorScore>(moderator);
        s.assessments_overturned = s.assessments_overturned + 1;
        s.stake_slashed_total    = s.stake_slashed_total + slash;
        s.stake_balance          = if (s.stake_balance >= slash) {
            s.stake_balance - slash
        } else { 0 };
    }

    public(friend) fun set_moderator_stake(moderator: address, amount: u64) acquires ModeratorScore {
        borrow_global_mut<ModeratorScore>(moderator).stake_balance = amount;
    }

    public(friend) fun set_moderator_active(moderator: address, active: bool) acquires ModeratorScore {
        borrow_global_mut<ModeratorScore>(moderator).is_active = active;
    }

    // ── Client writes ──────────────────────────────────────────────────────────
    public(friend) fun record_job_posted(client: address) acquires ClientScore {
        borrow_global_mut<ClientScore>(client).jobs_posted =
            borrow_global<ClientScore>(client).jobs_posted + 1;
    }

    public(friend) fun record_job_completed(client: address) acquires ClientScore {
        borrow_global_mut<ClientScore>(client).jobs_completed =
            borrow_global<ClientScore>(client).jobs_completed + 1;
    }

    public(friend) fun record_dispute_raised(client: address) acquires ClientScore {
        borrow_global_mut<ClientScore>(client).disputes_raised =
            borrow_global<ClientScore>(client).disputes_raised + 1;
    }

    // ── Views ──────────────────────────────────────────────────────────────────
    #[view]
    public fun freelancer_score(addr: address): (u64, u64, u64, u64, u64, u64, u64) acquires FreelancerScore {
        let s = borrow_global<FreelancerScore>(addr);
        (
            s.milestones_completed,
            s.milestones_disputed,
            s.milestones_rejected,
            s.total_rating_points,
            s.rating_count,
            s.lifetime_work_earned,
            s.streak_days,
        )
    }

    #[view]
    public fun avg_rating_x100(addr: address): u64 acquires FreelancerScore {
        let s = borrow_global<FreelancerScore>(addr);
        if (s.rating_count == 0) { 0 }
        else { s.total_rating_points / s.rating_count }
    }

    #[view]
    public fun completion_rate(addr: address): u64 acquires FreelancerScore {
        let s = borrow_global<FreelancerScore>(addr);
        let total = s.milestones_completed + s.milestones_rejected + s.milestones_disputed;
        if (total == 0) { 0 }
        else { (s.milestones_completed * 100) / total }
    }

    #[view]
    public fun streak_days(addr: address): u64 acquires FreelancerScore {
        borrow_global<FreelancerScore>(addr).streak_days
    }

    #[view]
    public fun moderator_score(addr: address): (u64, u64, u64, u64, bool) acquires ModeratorScore {
        let s = borrow_global<ModeratorScore>(addr);
        (s.assessments_total, s.assessments_overturned,
         s.stake_slashed_total, s.stake_balance, s.is_active)
    }

    #[view]
    public fun is_moderator_eligible(addr: address): bool acquires ModeratorScore {
        if (!exists<ModeratorScore>(addr)) { return false };
        let s = borrow_global<ModeratorScore>(addr);
        s.stake_balance >= 500_0000_0000 // 500 WORK minimum stake
    }
}
