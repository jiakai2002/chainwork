/// work_token.move
/// WORK coin — the platform's incentive and loyalty token.
/// Built on Aptos's native aptos_framework::coin standard (fungible asset model).
///
/// Design principles:
///   • Earned by completing milestones (escrow mints on release)
///   • Burned when disputing a moderator verdict (skin in the game)
///   • Staked by moderators to earn assessment rights
///   • Tier thresholds lock in loyalty benefits — leaving means losing them
module chainwork::work_token {
    use std::signer;
    use std::string;
    use aptos_framework::coin::{Self, BurnCapability, FreezeCapability, MintCapability};

    friend chainwork::job_escrow;

    // ── Errors ────────────────────────────────────────────────────────────────
    const E_NOT_AUTHORIZED : u64 = 1;
    const E_INSUFFICIENT   : u64 = 2;

    // ── Capabilities (held by the module deployer) ────────────────────────────
    struct Caps has key {
        mint  : MintCapability<WorkToken>,
        burn  : BurnCapability<WorkToken>,
        freeze: FreezeCapability<WorkToken>,
    }

    // ── Coin witness ──────────────────────────────────────────────────────────
    struct WorkToken {}

    // ── Tier thresholds (in WORK, 8 decimals) ────────────────────────────────
    const BRONZE_MIN  : u64 = 0;
    const SILVER_MIN  : u64 =   500_0000_0000; //    500 WORK
    const GOLD_MIN    : u64 =  2000_0000_0000; //  2,000 WORK
    const PLAT_MIN    : u64 = 10000_0000_0000; // 10,000 WORK

    // Tier IDs
    const TIER_BRONZE  : u8 = 0;
    const TIER_SILVER  : u8 = 1;
    const TIER_GOLD    : u8 = 2;
    const TIER_PLATINUM: u8 = 3;

    // ── Initialise (called once by deployer) ──────────────────────────────────
    public entry fun initialize(admin: &signer) {
        let (burn, freeze, mint) = coin::initialize<WorkToken>(
            admin,
            string::utf8(b"Work Token"),
            string::utf8(b"WORK"),
            8,     // decimals
            true,  // monitor supply
        );
        move_to(admin, Caps { mint, burn, freeze });
    }

    // ── Admin mint (deployer calls this to reward freelancers) ──────────────
    public entry fun admin_mint(
        admin:     &signer,
        recipient: address,
        amount:    u64,
    ) acquires Caps {
        let caps  = borrow_global<Caps>(signer::address_of(admin));
        let coins = coin::mint<WorkToken>(amount, &caps.mint);
        coin::deposit<WorkToken>(recipient, coins);
    }

    // ── Register (user must call before receiving WORK) ───────────────────────
    public entry fun register(account: &signer) {
        coin::register<WorkToken>(account);
    }

    // ── Mint — called by job_escrow using deployer address (no signer needed) ──
    public(friend) fun mint_to(
        admin_addr: address,
        recipient:  address,
        amount:     u64,
    ) acquires Caps {
        let caps  = borrow_global<Caps>(admin_addr);
        let coins = coin::mint<WorkToken>(amount, &caps.mint);
        coin::deposit<WorkToken>(recipient, coins);
    }

    // ── Burn — user calls this directly to burn their own WORK (e.g. to dispute)
    // coin::withdraw requires the owner's signer, so the user must sign this tx.
    public entry fun burn_own(
        owner: &signer,
        admin_addr: address,
        amount: u64,
    ) acquires Caps {
        let caps  = borrow_global<Caps>(admin_addr);
        let coins = coin::withdraw<WorkToken>(owner, amount);
        coin::burn<WorkToken>(coins, &caps.burn);
    }

    // ── View helpers ──────────────────────────────────────────────────────────
    #[view]
    public fun balance(addr: address): u64 {
        coin::balance<WorkToken>(addr)
    }

    #[view]
    public fun tier_of(addr: address): u8 {
        let bal = balance(addr);
        if (bal >= PLAT_MIN)   { TIER_PLATINUM }
        else if (bal >= GOLD_MIN)   { TIER_GOLD }
        else if (bal >= SILVER_MIN) { TIER_SILVER }
        else                        { TIER_BRONZE }
    }

    #[view]
    public fun fee_discount_bps(addr: address): u64 {
        // basis points off the 200bps platform fee
        let t = tier_of(addr);
        if (t == TIER_PLATINUM) { 60 }   // 30% off
        else if (t == TIER_GOLD)    { 40 }   // 20% off
        else if (t == TIER_SILVER)  { 20 }   // 10% off
        else                        { 0  }
    }

    // ── Constants exposed for other modules ───────────────────────────────────
    public fun silver_min(): u64 { SILVER_MIN }
    public fun gold_min():   u64 { GOLD_MIN   }
    public fun plat_min():   u64 { PLAT_MIN   }
    public fun tier_bronze():   u8 { TIER_BRONZE   }
    public fun tier_gold():     u8 { TIER_GOLD     }
    public fun tier_platinum(): u8 { TIER_PLATINUM }
}
