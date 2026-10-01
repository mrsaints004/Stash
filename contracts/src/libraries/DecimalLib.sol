// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title DecimalLib
/// @notice Utilities for USDC decimal conversion on Arc network.
///         CRITICAL: USDC has 18 decimals native (msg.value) vs 6 decimals ERC-20.
library DecimalLib {
    uint256 internal constant USDC_ERC20_DECIMALS = 6;
    uint256 internal constant USDC_NATIVE_DECIMALS = 18;
    uint256 internal constant DECIMAL_DIFFERENCE = 10 ** (USDC_NATIVE_DECIMALS - USDC_ERC20_DECIMALS); // 10^12

    /// @notice Convert USDC from ERC-20 (6 decimals) to native (18 decimals)
    function toNative(uint256 erc20Amount) internal pure returns (uint256) {
        return erc20Amount * DECIMAL_DIFFERENCE;
    }

    /// @notice Convert USDC from native (18 decimals) to ERC-20 (6 decimals)
    /// @dev Truncates sub-unit remainder
    function toErc20(uint256 nativeAmount) internal pure returns (uint256) {
        return nativeAmount / DECIMAL_DIFFERENCE;
    }
}
