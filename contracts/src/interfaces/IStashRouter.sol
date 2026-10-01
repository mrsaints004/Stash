// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IStashRouter
/// @notice Interface for Stash Router — executes swaps via Uniswap
interface IStashRouter {
    event TradeExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    /// @notice Execute a swap using borrowed USDC
    /// @param tokenIn The input token address
    /// @param tokenOut The output token address
    /// @param amountIn The input amount
    /// @param amountOutMin The minimum output amount (slippage protection)
    /// @return amountOut The actual output amount
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin
    ) external returns (uint256 amountOut);

    /// @notice Check if a token is allowed for trading
    /// @param token The token address
    /// @return Whether the token is on the allowlist
    function isAllowedToken(address token) external view returns (bool);
}
