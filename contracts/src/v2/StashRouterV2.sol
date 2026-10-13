// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {StashPausable} from "../StashPausable.sol";
import {SafeToken} from "../libraries/SafeToken.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {StashCreditV2} from "./StashCreditV2.sol";

/// @notice Atomic borrow + aggregator call. Output must arrive here before it can be delivered to the user.
contract StashRouterV2 is StashPausable {
    using SafeToken for address;
    uint256 public constant version = 2;
    uint256 public constant protocolFeeBps = 30;
    uint256 public constant maximumPriceDeviationBps = 500;
    StashCreditV2 public immutable credit;
    address public immutable usdc;
    mapping(address => mapping(address => bool)) public approvedRoute;
    mapping(address => bool) public allowedOutput;
    uint256 public collectedFees;
    event RouteConfigured(address indexed target, address indexed spender, bool enabled);
    event OutputConfigured(address indexed token, bool enabled);
    event TradeExecuted(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    error InvalidRoute();
    error ExecutionFailed();
    constructor(address stashCredit) {
        if (stashCredit.code.length == 0) revert InvalidRoute();
        credit = StashCreditV2(stashCredit); usdc = credit.usdc();
    }
    function configureRoute(address target, address spender, bool enabled) external onlyOwner {
        if (target.code.length == 0 || spender.code.length == 0) revert InvalidRoute();
        approvedRoute[target][spender] = enabled; emit RouteConfigured(target, spender, enabled);
    }
    function configureOutput(address token, bool enabled) external onlyOwner {
        if (token == usdc || token.code.length == 0) revert InvalidRoute();
        if (enabled) credit.vault().priceUsd6(token);
        allowedOutput[token] = enabled; emit OutputConfigured(token, enabled);
    }
    struct Trade { address tokenOut; uint256 amountIn; uint256 minimumOut; uint256 deadline; address target; address spender; bytes routeData; }
    function borrowAndSwap(Trade calldata trade) external whenNotPaused nonReentrant returns (uint256 amountOut) {
        if (!allowedOutput[trade.tokenOut] || !approvedRoute[trade.target][trade.spender] || trade.amountIn == 0 || trade.minimumOut == 0 || block.timestamp > trade.deadline || trade.deadline > block.timestamp + 300) revert InvalidRoute();
        uint256 inputBefore = IERC20(usdc).balanceOf(address(this));
        uint256 outputBefore = IERC20(trade.tokenOut).balanceOf(address(this));
        uint256 fee = trade.amountIn * protocolFeeBps / 10000;
        uint256 inputValue = (trade.amountIn - fee) * credit.vault().priceUsd6(usdc) / 1e6;
        uint256 fairOutput = inputValue * 10 ** uint256(IERC20(trade.tokenOut).decimals()) / credit.vault().priceUsd6(trade.tokenOut);
        uint256 oracleMinimum = fairOutput * (10000 - maximumPriceDeviationBps) / 10000;
        if (trade.minimumOut < oracleMinimum) revert InvalidRoute();
        credit.borrowForTrade(msg.sender, trade.amountIn);
        usdc.forceApprove(trade.spender, trade.amountIn - fee);
        (bool success,) = trade.target.call(trade.routeData);
        if (!success) revert ExecutionFailed();
        usdc.forceApprove(trade.spender, 0);
        if (IERC20(usdc).balanceOf(address(this)) != inputBefore + fee) revert ExecutionFailed();
        amountOut = IERC20(trade.tokenOut).balanceOf(address(this)) - outputBefore;
        if (amountOut < trade.minimumOut) revert ExecutionFailed();
        collectedFees += fee;
        trade.tokenOut.safeTransfer(msg.sender, amountOut);
        emit TradeExecuted(msg.sender, usdc, trade.tokenOut, trade.amountIn, amountOut);
    }
    function withdrawFees(address recipient) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert InvalidRoute();
        uint256 amount = collectedFees; collectedFees = 0;
        usdc.safeTransfer(recipient, amount);
    }
}
