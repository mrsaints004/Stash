// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {StashPausable} from "../StashPausable.sol";
import {SafeToken} from "../libraries/SafeToken.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {StashVaultV2} from "./StashVaultV2.sol";

/// @notice Delegates eligibility, close factor, pricing, bonus and debt burning to Aave's native liquidation.
contract StashLiquidationV2 is StashPausable {
    using SafeToken for address;
    StashVaultV2 public immutable vault;
    event Liquidated(address indexed user, address indexed asset, address indexed liquidator, uint256 repaid, uint256 seized);
    error InvalidLiquidation();
    constructor(address stashVault) { vault = StashVaultV2(stashVault); }
    function liquidate(address user, address asset, uint256 debtToCover, uint256 minimumCollateral) external whenNotPaused nonReentrant {
        address account = vault.accounts(user); address usdc = vault.usdc();
        if (account == address(0) || asset == usdc || debtToCover == 0 || minimumCollateral == 0) revert InvalidLiquidation();
        uint256 inputBefore = IERC20(usdc).balanceOf(address(this));
        uint256 collateralBefore = IERC20(asset).balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), debtToCover);
        usdc.forceApprove(address(vault.pool()), debtToCover);
        vault.pool().liquidationCall(vault.reserveIdOf(asset), vault.usdcReserveId(), account, debtToCover, false);
        usdc.forceApprove(address(vault.pool()), 0);
        uint256 refund = IERC20(usdc).balanceOf(address(this)) - inputBefore;
        uint256 seized = IERC20(asset).balanceOf(address(this)) - collateralBefore;
        if (seized < minimumCollateral || refund > debtToCover) revert InvalidLiquidation();
        if (refund > 0) usdc.safeTransfer(msg.sender, refund);
        asset.safeTransfer(msg.sender, seized);
        emit Liquidated(user, asset, msg.sender, debtToCover - refund, seized);
    }
}
