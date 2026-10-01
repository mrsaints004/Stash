// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IStashCredit
/// @notice Interface for Stash Credit — borrows USDC from Aave V4 against collateral
interface IStashCredit {
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);

    /// @notice Borrow USDC against deposited collateral
    /// @param amount The USDC amount to borrow (6 decimals)
    function borrow(uint256 amount) external;

    /// @notice Repay outstanding USDC debt
    /// @param amount The USDC amount to repay (6 decimals, type(uint256).max for full)
    function repay(uint256 amount) external;

    /// @notice Get user's outstanding debt
    /// @param user The user address
    /// @return The debt amount in USDC (6 decimals)
    function debtOf(address user) external view returns (uint256);

    /// @notice Get user's available borrow capacity (Stash Power)
    /// @param user The user address
    /// @return The available USDC borrow amount (6 decimals)
    function availableCredit(address user) external view returns (uint256);
}
