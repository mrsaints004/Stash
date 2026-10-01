// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IStashRouter} from "./interfaces/IStashRouter.sol";
import {IStashCredit} from "./interfaces/IStashCredit.sol";
import {StashErrors} from "./libraries/StashErrors.sol";
import {StashEvents} from "./libraries/StashEvents.sol";

/// @title ISwapRouter
/// @notice Minimal Uniswap V4 swap router interface
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        returns (uint256 amountOut);
}

/// @title StashRouter
/// @notice Executes swaps via Uniswap with borrowed USDC.
///         Only allows trading with tokens on the allowlist.
///         Validates that user has sufficient Stash Power (credit) before trading.
contract StashRouter is IStashRouter {
    address public owner;
    IStashCredit public stashCredit;
    ISwapRouter public swapRouter;
    address public usdc;

    /// @dev Default pool fee (0.3%)
    uint24 public constant DEFAULT_FEE = 3000;

    /// @dev Protocol fee in basis points (0.3%)
    uint256 public constant PROTOCOL_FEE_BPS = 30;
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @dev token address => is allowed for trading
    mapping(address => bool) private _allowedTokens;

    /// @dev user => token => position amount
    mapping(address => mapping(address => uint256)) public tradePositions;

    /// @dev Collected protocol fees per token
    mapping(address => uint256) public collectedFees;

    modifier onlyOwner() {
        if (msg.sender != owner) revert StashErrors.NotOwner();
        _;
    }

    constructor(address _stashCredit, address _swapRouter, address _usdc) {
        owner = msg.sender;
        stashCredit = IStashCredit(_stashCredit);
        swapRouter = ISwapRouter(_swapRouter);
        usdc = _usdc;
    }

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
    ) external override returns (uint256 amountOut) {
        if (amountIn == 0) revert StashErrors.ZeroAmount();
        if (!_allowedTokens[tokenIn]) revert StashErrors.TokenNotAllowed(tokenIn);
        if (!_allowedTokens[tokenOut]) revert StashErrors.TokenNotAllowed(tokenOut);

        // Calculate protocol fee
        uint256 fee = (amountIn * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 swapAmount = amountIn - fee;

        // Transfer tokenIn from user
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        // Collect fee
        collectedFees[tokenIn] += fee;

        // Approve swap router
        IERC20(tokenIn).approve(address(swapRouter), swapAmount);

        // Execute swap
        amountOut = swapRouter.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: DEFAULT_FEE,
                recipient: msg.sender,
                amountIn: swapAmount,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            })
        );

        if (amountOut < amountOutMin) {
            revert StashErrors.SlippageExceeded(amountOut, amountOutMin);
        }

        // Track position
        tradePositions[msg.sender][tokenOut] += amountOut;

        emit TradeExecuted(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
        emit StashEvents.TradeExecuted(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    /// @notice Check if a token is allowed for trading
    function isAllowedToken(address token) external view override returns (bool) {
        return _allowedTokens[token];
    }

    // --- Admin functions ---

    function addAllowedToken(address token) external onlyOwner {
        if (token == address(0)) revert StashErrors.ZeroAddress();
        _allowedTokens[token] = true;
        emit StashEvents.TokenAllowed(token);
    }

    function removeAllowedToken(address token) external onlyOwner {
        _allowedTokens[token] = false;
        emit StashEvents.TokenDisallowed(token);
    }

    function withdrawFees(address token, address to) external onlyOwner {
        uint256 feeAmount = collectedFees[token];
        if (feeAmount == 0) revert StashErrors.ZeroAmount();
        collectedFees[token] = 0;
        IERC20(token).transfer(to, feeAmount);
    }
}
