// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IStashLiquidation
/// @notice Interface for the Stash Liquidation contract
interface IStashLiquidation {
    function liquidate(address user, address collateralAsset, uint256 debtToRepay) external;
    function isLiquidatable(address user) external view returns (bool, uint256, uint256);
}
