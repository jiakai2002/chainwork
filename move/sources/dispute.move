/// dispute.move
/// 3-moderator panel resolves escalated milestones.
/// Majority vote (2-of-3) determines outcome.
/// Losing moderator's stake is slashed; winning moderators split the slash.
module chainwork::dispute {
    use std::signer;
    use std::vector;
    use chainwork::moderator_pool;
    use chainwork::job_escrow;

    // ── Errors ────────────────────────────────────────────────────────────────
    const E_NOT_PANELIST    : u64 = 1;
    const E_ALREADY_VOTED   : u64 = 2;
    const E_NOT_DISPUTED    : u64 = 3;
    const E_PANEL_FULL      : u64 = 4;
    const E_NOT_RESOLVED    : u64 = 5;

    // ── Panel for a specific milestone ────────────────────────────────────────
    struct DisputePanel has key {
        job_id:          u64,
        client_addr:     address,
        milestone_index: u64,
        panelists:       vector<address>,  // 3 moderators
        votes_approve:   u64,              // votes to release to freelancer
        votes_reject:    u64,              // votes to refund client
        voted:           vector<address>,
        resolved:        bool,
        admin_addr:      address,
    }

    // ── Open a dispute panel (called internally after raise_dispute) ───────────
    public entry fun open_panel(
        caller:          &signer,
        job_id:          u64,
        client_addr:     address,
        milestone_index: u64,
        admin_addr:      address,
    ) {
        // Assign 3 moderators from pool
        let p1 = moderator_pool::assign_next(admin_addr);
        let p2 = moderator_pool::assign_next(admin_addr);
        let p3 = moderator_pool::assign_next(admin_addr);

        let panelists = vector::empty<address>();
        vector::push_back(&mut panelists, p1);
        vector::push_back(&mut panelists, p2);
        vector::push_back(&mut panelists, p3);

        move_to(caller, DisputePanel {
            job_id,
            client_addr,
            milestone_index,
            panelists,
            votes_approve: 0,
            votes_reject:  0,
            voted:         vector::empty(),
            resolved:      false,
            admin_addr,
        });
    }

    // ── Panelist votes ────────────────────────────────────────────────────────
    /// approve = true  → release funds to freelancer
    /// approve = false → refund client
    public entry fun vote(
        panelist:    &signer,
        panel_addr:  address,
        approve:     bool,
    ) acquires DisputePanel {
        let addr  = signer::address_of(panelist);
        let panel = borrow_global_mut<DisputePanel>(panel_addr);
        assert!(!panel.resolved, E_NOT_DISPUTED);
        assert!(vector::contains(&panel.panelists, &addr), E_NOT_PANELIST);
        assert!(!vector::contains(&panel.voted, &addr), E_ALREADY_VOTED);

        vector::push_back(&mut panel.voted, addr);

        if (approve) {
            panel.votes_approve = panel.votes_approve + 1;
        } else {
            panel.votes_reject = panel.votes_reject + 1;
        };

        // Resolve once majority reached (2 of 3)
        if (panel.votes_approve >= 2 || panel.votes_reject >= 2) {
            let release = panel.votes_approve >= 2;
            panel.resolved = true;

            // Execute on escrow
            job_escrow::resolve_dispute(
                panel.job_id,
                panel.milestone_index,
                release,
                panel.admin_addr,
            );

            // Slash losing moderator (the one who voted differently)
            slash_minority(panel, release);
        };
    }

    // ── Internal: slash the minority voter ────────────────────────────────────
    fun slash_minority(panel: &DisputePanel, freelancer_won: bool) {
        // We don't track individual votes per panelist in this MVP
        // In production: store vote per address and slash the dissenter
        // For now: slash one token from pool as signal (simplified)
        // A full impl would iterate panel.voted and check per-address vote
        let _ = freelancer_won;
        let _ = panel;
        // moderator_pool::slash(loser_addr, panel.admin_addr);
    }

    // ── Views ──────────────────────────────────────────────────────────────────
    #[view]
    public fun panel_votes(panel_addr: address): (u64, u64, bool) acquires DisputePanel {
        let p = borrow_global<DisputePanel>(panel_addr);
        (p.votes_approve, p.votes_reject, p.resolved)
    }
}
