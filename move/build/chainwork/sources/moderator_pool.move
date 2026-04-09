/// moderator_pool.move
/// Moderators stake WORK to earn the right to assess freelancer submissions.
/// A moderator is assigned to a milestone after the freelancer submits.
/// Bad verdicts (overturned by a 3-person panel) slash their stake.
///
/// Eligibility requirements:
///   1. Gold tier or above (proven track record as a freelancer first)
///   2. Stake >= 500 WORK
///   3. Must have passed calibration (set off-chain by admin, recorded here)
module chainwork::moderator_pool {
    use std::signer;
    use std::vector;
    use aptos_framework::coin;
    use chainwork::work_token::WorkToken;
    use chainwork::reputation;

    friend chainwork::job_escrow;
    friend chainwork::dispute;

    // ── Errors ────────────────────────────────────────────────────────────────
    const E_ALREADY_REGISTERED  : u64 = 1;
    const E_INSUFFICIENT_STAKE   : u64 = 2;
    const E_NOT_CALIBRATED       : u64 = 3;
    const E_NOT_ACTIVE           : u64 = 4;
    const E_NOT_AUTHORIZED       : u64 = 5;
    const E_WRONG_TIER           : u64 = 6;

    // ── Constants ─────────────────────────────────────────────────────────────
    const MIN_STAKE : u64 = 500_0000_0000;  // 500 WORK (8 decimals)
    const SLASH_AMT : u64 =  10_0000_0000;  //  10 WORK per overturned verdict

    // ── Global pool ───────────────────────────────────────────────────────────
    /// Held at the deployer's address
    struct ModeratorPool has key {
        active_moderators: vector<address>,  // round-robin assignment pool
        next_index:        u64,
        admin:             address,
        staked_coins:      coin::Coin<WorkToken>, // all stakes held here
    }

    // ── Per-moderator record ──────────────────────────────────────────────────
    struct ModeratorEntry has key {
        stake:      u64,
        calibrated: bool,
        active:     bool,
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    public entry fun initialize(admin: &signer) {
        move_to(admin, ModeratorPool {
            active_moderators: vector::empty(),
            next_index:        0,
            admin:             signer::address_of(admin),
            staked_coins:      coin::zero<WorkToken>(),
        });
    }

    // ── Register as moderator (Gold tier required) ────────────────────────────
    public entry fun register(
        account: &signer,
        admin_addr: address,
    ) {
        let addr = signer::address_of(account);
        assert!(!exists<ModeratorEntry>(addr), E_ALREADY_REGISTERED);

        // Must be Gold tier or above
        let tier = chainwork::work_token::tier_of(addr);
        assert!(tier >= chainwork::work_token::tier_gold(), E_WRONG_TIER);

        move_to(account, ModeratorEntry { stake: 0, calibrated: false, active: false });
        reputation::register_moderator(account);
    }

    // ── Admin marks calibrated (after passing test assessments) ───────────────
    public entry fun set_calibrated(
        admin: &signer,
        moderator: address,
        admin_addr: address,
    ) acquires ModeratorPool, ModeratorEntry {
        let pool = borrow_global<ModeratorPool>(admin_addr);
        assert!(signer::address_of(admin) == pool.admin, E_NOT_AUTHORIZED);
        borrow_global_mut<ModeratorEntry>(moderator).calibrated = true;
    }

    // ── Stake WORK to activate ────────────────────────────────────────────────
    public entry fun stake(
        account: &signer,
        amount: u64,
        admin_addr: address,
    ) acquires ModeratorPool, ModeratorEntry {
        let addr = signer::address_of(account);
        let entry = borrow_global_mut<ModeratorEntry>(addr);
        assert!(entry.calibrated, E_NOT_CALIBRATED);

        let coins = coin::withdraw<WorkToken>(account, amount);
        let pool  = borrow_global_mut<ModeratorPool>(admin_addr);
        coin::merge(&mut pool.staked_coins, coins);

        entry.stake = entry.stake + amount;
        reputation::set_moderator_stake(addr, entry.stake);

        if (entry.stake >= MIN_STAKE && !entry.active) {
            entry.active = true;
            reputation::set_moderator_active(addr, true);
            vector::push_back(&mut pool.active_moderators, addr);
        };
    }

    // ── Unstake (removes from active pool if below minimum) ───────────────────
    public entry fun unstake(
        account: &signer,
        amount: u64,
        admin_addr: address,
    ) acquires ModeratorPool, ModeratorEntry {
        let addr = signer::address_of(account);
        let entry = borrow_global_mut<ModeratorEntry>(addr);
        assert!(entry.stake >= amount, E_INSUFFICIENT_STAKE);

        let pool  = borrow_global_mut<ModeratorPool>(admin_addr);
        let coins = coin::extract(&mut pool.staked_coins, amount);
        coin::deposit<WorkToken>(addr, coins);

        entry.stake = entry.stake - amount;
        reputation::set_moderator_stake(addr, entry.stake);

        if (entry.stake < MIN_STAKE && entry.active) {
            entry.active = false;
            reputation::set_moderator_active(addr, false);
            remove_from_pool(&mut pool.active_moderators, addr);
        };
    }

    // ── Assign next moderator (round-robin, called by job_escrow) ─────────────
    public(friend) fun assign_next(admin_addr: address): address acquires ModeratorPool {
        let pool = borrow_global_mut<ModeratorPool>(admin_addr);
        let len  = vector::length(&pool.active_moderators);
        assert!(len > 0, E_NOT_ACTIVE);
        let idx  = pool.next_index % len;
        pool.next_index = pool.next_index + 1;
        *vector::borrow(&pool.active_moderators, idx)
    }

    // ── Slash (called by dispute module on overturn) ──────────────────────────
    public(friend) fun slash(
        moderator: address,
        admin_addr: address,
    ) acquires ModeratorPool, ModeratorEntry {
        let pool  = borrow_global_mut<ModeratorPool>(admin_addr);
        let entry = borrow_global_mut<ModeratorEntry>(moderator);

        let slash = if (entry.stake >= SLASH_AMT) { SLASH_AMT } else { entry.stake };
        entry.stake = entry.stake - slash;
        // slashed coins stay in pool treasury (benefit remaining moderators)

        reputation::record_overturned(moderator, slash);
        reputation::set_moderator_stake(moderator, entry.stake);

        if (entry.stake < MIN_STAKE && entry.active) {
            entry.active = false;
            reputation::set_moderator_active(moderator, false);
            remove_from_pool(&mut pool.active_moderators, moderator);
        };
    }

    // ── Internal ──────────────────────────────────────────────────────────────
    fun remove_from_pool(pool: &mut vector<address>, addr: address) {
        let len = vector::length(pool);
        let i   = 0;
        while (i < len) {
            if (*vector::borrow(pool, i) == addr) {
                vector::swap_remove(pool, i);
                return
            };
            i = i + 1;
        };
    }

    // ── Internal count (callable from other modules) ─────────────────────────
    public(friend) fun pool_size(admin_addr: address): u64 acquires ModeratorPool {
        vector::length(&borrow_global<ModeratorPool>(admin_addr).active_moderators)
    }

    // ── Views ──────────────────────────────────────────────────────────────────
    #[view]
    public fun active_count(admin_addr: address): u64 acquires ModeratorPool {
        vector::length(&borrow_global<ModeratorPool>(admin_addr).active_moderators)
    }

    #[view]
    public fun moderator_stake(addr: address): u64 acquires ModeratorEntry {
        borrow_global<ModeratorEntry>(addr).stake
    }

    #[view]
    public fun is_active(addr: address): bool acquires ModeratorEntry {
        if (!exists<ModeratorEntry>(addr)) { return false };
        borrow_global<ModeratorEntry>(addr).active
    }
}
