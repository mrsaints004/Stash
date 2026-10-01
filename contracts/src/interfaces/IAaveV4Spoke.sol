// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAaveV4Spoke
/// @notice Interface for Aave V4 Spoke contract on Arc network.
///         Exact method signatures to be confirmed from Arc explorer before Phase 2.
interface IAaveV4Spoke {
    /// @notice Supply an asset as collateral
    /// @param asset The address of the asset to supply
    /// @param amount The amount to supply
    /// @param onBehalfOf The address that will receive the aTokens
    /// @param referralCode Referral code (0 for none)
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;

    /// @notice Withdraw a supplied asset
    /// @param asset The address of the asset to withdraw
    /// @param amount The amount to withdraw (type(uint256).max for full balance)
    /// @param to The address that will receive the underlying asset
    /// @return The final amount withdrawn
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);

    /// @notice Borrow an asset
    /// @param asset The address of the asset to borrow
    /// @param amount The amount to borrow
    /// @param interestRateMode 1 = stable, 2 = variable
    /// @param referralCode Referral code
    /// @param onBehalfOf The address that will receive the debt
    function borrow(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        uint16 referralCode,
        address onBehalfOf
    ) external;

    /// @notice Repay a borrowed asset
    /// @param asset The address of the asset to repay
    /// @param amount The amount to repay (type(uint256).max for full debt)
    /// @param interestRateMode The interest rate mode of the debt
    /// @param onBehalfOf The address of the user who will get their debt reduced
    /// @return The final amount repaid
    function repay(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        address onBehalfOf
    ) external returns (uint256);

    /// @notice Get user account data
    /// @param user The address of the user
    /// @return totalCollateralBase Total collateral in base currency
    /// @return totalDebtBase Total debt in base currency
    /// @return availableBorrowsBase Available borrows in base currency
    /// @return currentLiquidationThreshold Current liquidation threshold
    /// @return ltv Current loan-to-value
    /// @return healthFactor Current health factor
    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );
}
