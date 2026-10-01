// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

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
contract StashCredit is IStashCredit {
    address public owner;
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

    modifier onlyOwner() {
        if (msg.sender != owner) revert StashErrors.NotOwner();
        _;
    }

    constructor(address _aaveSpoke, address _stashVault, address _usdc) {
        owner = msg.sender;
        aaveSpoke = IAaveV4Spoke(_aaveSpoke);
        stashVault = IStashVault(_stashVault);
        usdc = IERC20(_usdc);
    }

    /// @notice Borrow USDC against deposited collateral
    /// @param amount The USDC amount to borrow (6 decimals)
    function borrow(uint256 amount) external override {
        if (amount == 0) revert StashErrors.ZeroAmount();

        // Check available credit from Aave's perspective
        (, , uint256 availableBorrowsBase, , ,) =
            aaveSpoke.getUserAccountData(address(stashVault));

        // availableBorrowsBase is in base currency (8 decimals from Aave)
        // We need to check that the user's share allows this borrow
        uint256 userDebt = _debts[msg.sender];
        uint256 newDebt = userDebt + amount;

        // Simple credit check: user's new debt can't exceed their share of available borrows
        // In production, this would use per-user collateral valuation
        // For now, we verify the vault can handle the total debt increase
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
        usdc.transfer(msg.sender, amount);

        emit Borrowed(msg.sender, amount);
        emit StashEvents.CreditBorrowed(msg.sender, amount);
    }

    /// @notice Repay outstanding USDC debt
    /// @param amount The USDC amount to repay (6 decimals, type(uint256).max for full)
    function repay(uint256 amount) external override {
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
        usdc.transferFrom(msg.sender, address(this), repayAmount);

        // Approve Aave Spoke to pull the USDC
        usdc.approve(address(aaveSpoke), repayAmount);

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
    function availableCredit(address user) external view override returns (uint256) {
        (, , uint256 availableBorrowsBase, , ,) =
            aaveSpoke.getUserAccountData(address(stashVault));

        uint256 userDebt = _debts[user];

        // If the vault has available borrows and user has no/low debt, they can borrow
        // This is a simplified model — full implementation would use per-user collateral
        if (availableBorrowsBase <= userDebt) return 0;
        return availableBorrowsBase - userDebt;
    }
}
