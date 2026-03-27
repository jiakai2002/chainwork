// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title WorkToken (WORK)
 * @notice Simple ERC-20 token used as the platform currency.
 *         - Deployer gets an initial supply to distribute / use in demos.
 *         - The FreelanceEscrow contract can mint reward tokens to freelancers
 *           upon job completion (set via setEscrow()).
 *
 *  School project talking points:
 *   • ERC-20 standard: balanceOf, transfer, approve, transferFrom
 *   • Controlled minting: only the escrow contract can mint rewards
 *   • Separation of concerns: token logic is its own contract
 */
contract WorkToken {

    // ─── ERC-20 state ────────────────────────────────────────────────────────

    string  public constant name     = "Work Token";
    string  public constant symbol   = "WORK";
    uint8   public constant decimals = 18;

    uint256 public totalSupply;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ─── Access control ──────────────────────────────────────────────────────

    address public owner;
    address public escrowContract;   // the only address allowed to mint rewards

    // ─── Events ──────────────────────────────────────────────────────────────

    event Transfer(address indexed from,    address indexed to,      uint256 value);
    event Approval(address indexed owner_,  address indexed spender, uint256 value);
    event EscrowSet(address indexed escrow);

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param initialSupply Tokens minted to deployer (use 1_000_000 for demo).
     */
    constructor(uint256 initialSupply) {
        owner = msg.sender;
        _mint(msg.sender, initialSupply * 10 ** decimals);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /**
     * @notice Owner sets which escrow contract may call mintReward().
     *         Call this after deploying FreelanceEscrow.
     */
    function setEscrow(address escrow) external {
        require(msg.sender == owner, "Only owner");
        escrowContract = escrow;
        emit EscrowSet(escrow);
    }

    // ─── ERC-20 core ─────────────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "Allowance exceeded");
        allowance[from][msg.sender] -= amount;
        _transfer(from, to, amount);
        return true;
    }

    // ─── Reward minting (escrow only) ────────────────────────────────────────

    /**
     * @notice Mints `amount` WORK tokens to `to` as a completion reward.
     *         Only callable by the registered escrow contract.
     * @param to     Recipient (the freelancer who completed the job).
     * @param amount Raw token amount (already includes decimals).
     */
    function mintReward(address to, uint256 amount) external {
        require(msg.sender == escrowContract, "Only escrow can mint rewards");
        _mint(to, amount);
    }

    // ─── Internals ────────────────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0),             "Transfer to zero address");
        require(balanceOf[from] >= amount,    "Insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply     += amount;
        balanceOf[to]   += amount;
        emit Transfer(address(0), to, amount);
    }
}
