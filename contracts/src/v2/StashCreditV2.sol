// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {StashPausable} from "../StashPausable.sol";
import {SafeToken} from "../libraries/SafeToken.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IAaveV4Spoke} from "./IAaveV4.sol";
import {StashVaultV2} from "./StashVaultV2.sol";
import {StashLendingAccount} from "./StashLendingAccount.sol";

contract StashCreditV2 is StashPausable {
    using SafeToken for address;
    uint256 public constant version = 2;
    StashVaultV2 public immutable vault;
    address public immutable usdc;
    address public stashRouter;
    uint256 public maximumCredit = 50_000e6;
    event MaximumCreditChanged(uint256 amount);
    function setMaximumCredit(uint256 amount) external onlyOwner { if (amount == 0) revert InvalidConfiguration(); maximumCredit = amount; emit MaximumCreditChanged(amount); }
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event RouterSet(address indexed router);
    error InvalidConfiguration();
    error InsufficientCredit(uint256 requested, uint256 available);
    error Unauthorized();
    constructor(address stashVault) {
        if (stashVault.code.length == 0) revert InvalidConfiguration();
        vault = StashVaultV2(stashVault); usdc = vault.usdc();

    }
    function setRouter(address router) external onlyOwner {
        if (stashRouter != address(0) || router.code.length == 0) revert InvalidConfiguration();
        stashRouter = router;
        emit RouterSet(router);
    }
    function debtOf(address user) public view returns (uint256) {
        address account = vault.accounts(user);
        return account == address(0) ? 0 : vault.pool().getUserTotalDebt(vault.usdcReserveId(), account);
    }
    function availableCredit(address user) public view returns (uint256) {
        IAaveV4Spoke.ReserveConfig memory reserve = vault.pool().getReserveConfig(vault.usdcReserveId());
        if (paused || reserve.paused || reserve.frozen || !reserve.borrowable) return 0;
        uint256 capacity = vault.borrowingCapacity(user); uint256 debt = debtOf(user);
        if (capacity > maximumCredit) capacity = maximumCredit;
        if (capacity <= debt || vault.accounts(user) == address(0)) return 0;
        (,,uint256 protocolAvailable,,,) = vault.lendingHealth(user);
        uint256 protocolCapacity = protocolAvailable / 100 * 1e6 / vault.priceUsd6(usdc);
        uint256 personalCapacity = capacity - debt;
        return protocolCapacity < personalCapacity ? protocolCapacity : personalCapacity;
    }
    function borrow(uint256 amount) external whenNotPaused nonReentrant { _borrow(msg.sender, amount, msg.sender); }
    function borrowForTrade(address user, uint256 amount) external whenNotPaused nonReentrant {
        if (msg.sender != stashRouter) revert Unauthorized();
        _borrow(user, amount, msg.sender);
    }
    function _borrow(address user, uint256 amount, address recipient) private {
        uint256 available = availableCredit(user);
        if (amount == 0 || amount > available) revert InsufficientCredit(amount, available);
        StashLendingAccount(vault.accounts(user)).borrow(amount, recipient);
        emit Borrowed(user, amount);
    }
    function repay(uint256 amount) external nonReentrant {
        uint256 debt = debtOf(msg.sender);
        if (amount > debt) amount = debt;
        if (amount == 0) revert InsufficientCredit(amount, debt);
        address account = vault.accounts(msg.sender);
        usdc.safeTransferFrom(msg.sender, account, amount);
        uint256 actual = StashLendingAccount(account).repay(amount, msg.sender);
        emit Repaid(msg.sender, actual);
    }
}
