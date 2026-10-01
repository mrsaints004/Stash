// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title StashErrors
/// @notice Custom errors for the Stash protocol
library StashErrors {
    error UnsupportedAsset(address asset);
    error InsufficientBalance(address user, address asset, uint256 requested, uint256 available);
    error InsufficientCredit(address user, uint256 requested, uint256 available);
    error ExceedsLTV(address user, uint256 currentLtv, uint256 maxLtv);
    error TokenNotAllowed(address token);
    error SlippageExceeded(uint256 amountOut, uint256 amountOutMin);
    error ZeroAmount();
    error ZeroAddress();
    error Paused();
    error NotOwner();
    error LTVTooHigh(address user, uint256 ltv);
}
