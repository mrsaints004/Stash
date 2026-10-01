// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IStashVault
/// @notice Interface for the Stash Vault — accepts collateral and supplies to Aave V4
interface IStashVault {
    event Deposited(address indexed user, address indexed asset, uint256 amount);
    event Withdrawn(address indexed user, address indexed asset, uint256 amount);

    /// @notice Deposit collateral asset into the vault
    /// @param asset The ERC-20 collateral token address
    /// @param amount The amount to deposit
    function deposit(address asset, uint256 amount) external;

    /// @notice Withdraw collateral from the vault
    /// @param asset The ERC-20 collateral token address
    /// @param amount The amount to withdraw
    function withdraw(address asset, uint256 amount) external;

    /// @notice Get a user's deposited balance for an asset
    /// @param user The user address
    /// @param asset The asset address
    /// @return The deposited amount
    function balanceOf(address user, address asset) external view returns (uint256);

    /// @notice Check if an asset is supported as collateral
    /// @param asset The asset address
    /// @return Whether the asset is supported
    function isSupportedAsset(address asset) external view returns (bool);
}
