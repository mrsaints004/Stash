// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
// Legacy V1 retained for regression tests. Not a supported Arc deployment; use src/v2/.

import {StashPausable} from "./StashPausable.sol";
import {SafeToken} from "./libraries/SafeToken.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IStashCredit} from "./interfaces/IStashCredit.sol";
import {IStashVault} from "./interfaces/IStashVault.sol";
import {IAaveV4Spoke} from "./interfaces/IAaveV4Spoke.sol";
import {StashErrors} from "./libraries/StashErrors.sol";
import {StashEvents} from "./libraries/StashEvents.sol";

/// @title StashCredit
/// @notice Borrows USDC from Aave V4 against deposited collateral in StashVault.
///         Users can borrow up to their available credit (collateral * LTV - existing debt).
///         Repayment reduces outstanding debt. The vault's Aave position backs all borrows.
interface IVaultRisk { function borrowingCapacity(address user) external view returns (uint256); }

contract StashCredit is IStashCredit, StashPausable {
    using SafeToken for address;
    IAaveV4Spoke public aaveSpoke;
    IStashVault public stashVault;
    IERC20 public usdc;

    /// @dev LTV basis points: 7500 = 75%
    uint256 public constant LTV_BPS = 7500;
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @dev Aave variable rate mode
    uint256 public constant VARIABLE_RATE = 2;

    /// @dev user => outstanding USDC debt (6 decimals)
    mapping(address => uint256) private _debts;

    /// @dev total USDC debt across all users
    uint256 public totalDebt;

    constructor(address _aaveSpoke, address _stashVault, address _usdc) {
        aaveSpoke = IAaveV4Spoke(_aaveSpoke);
        stashVault = IStashVault(_stashVault);
        usdc = IERC20(_usdc);
    }

    /// @notice Borrow USDC against deposited collateral
    /// @param amount The USDC amount to borrow (6 decimals)
    function borrow(uint256 amount) external override whenNotPaused nonReentrant {
        if (amount == 0) revert StashErrors.ZeroAmount();

        uint256 available = availableCredit(msg.sender);
        if (amount > available) revert StashErrors.InsufficientCredit(msg.sender, amount, available);
        uint256 newDebt = _debts[msg.sender] + amount;
        uint256 newTotalDebt = totalDebt + amount;

        // Borrow USDC from Aave V4 on behalf of the vault
        // The vault must have delegated credit to this contract
        aaveSpoke.borrow(
            address(usdc),
            amount,
            VARIABLE_RATE,
            0, // no referral
            address(stashVault)
        );

        // Update debt tracking
        _debts[msg.sender] = newDebt;
        totalDebt = newTotalDebt;

        // Transfer borrowed USDC to the user
        address(usdc).safeTransfer(msg.sender, amount);

        emit Borrowed(msg.sender, amount);
        emit StashEvents.CreditBorrowed(msg.sender, amount);
    }

    /// @notice Repay outstanding USDC debt
    /// @param amount The USDC amount to repay (6 decimals, type(uint256).max for full)
    function repay(uint256 amount) external override nonReentrant {
        uint256 userDebt = _debts[msg.sender];
        if (userDebt == 0) revert StashErrors.ZeroAmount();

        uint256 repayAmount = amount;
        if (repayAmount == type(uint256).max) {
            repayAmount = userDebt;
        }

        if (repayAmount > userDebt) {
            repayAmount = userDebt;
        }

        if (repayAmount == 0) revert StashErrors.ZeroAmount();

        // Transfer USDC from user to this contract
        address(usdc).safeTransferFrom(msg.sender, address(this), repayAmount);

        // Approve Aave Spoke to pull the USDC
        address(usdc).forceApprove(address(aaveSpoke), repayAmount);

        // Repay Aave V4 debt on behalf of the vault
        aaveSpoke.repay(
            address(usdc),
            repayAmount,
            VARIABLE_RATE,
            address(stashVault)
        );

        // Update debt tracking
        _debts[msg.sender] = userDebt - repayAmount;
        totalDebt -= repayAmount;

        emit Repaid(msg.sender, repayAmount);
        emit StashEvents.CreditRepaid(msg.sender, repayAmount);
    }

    /// @notice Get user's outstanding debt
    function debtOf(address user) external view override returns (uint256) {
        return _debts[user];
    }

    /// @notice Get user's available borrow capacity
    function availableCredit(address user) public view override returns (uint256) {
        uint256 capacity = IVaultRisk(address(stashVault)).borrowingCapacity(user);
        return capacity > _debts[user] ? capacity - _debts[user] : 0;
    }
}
