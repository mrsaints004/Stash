// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title StashEvents
/// @notice Events emitted by the Stash protocol
library StashEvents {
    event CollateralDeposited(address indexed user, address indexed asset, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed asset, uint256 amount);
    event CreditBorrowed(address indexed user, uint256 usdcAmount);
    event CreditRepaid(address indexed user, uint256 usdcAmount);
    event TradeExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event LiquidationTriggered(address indexed user, address indexed asset, uint256 debtRepaid, uint256 collateralSeized);
    event ProtocolPaused(address indexed by);
    event ProtocolUnpaused(address indexed by);
    event AssetAdded(address indexed asset);
    event AssetRemoved(address indexed asset);
    event TokenAllowed(address indexed token);
    event TokenDisallowed(address indexed token);
}
