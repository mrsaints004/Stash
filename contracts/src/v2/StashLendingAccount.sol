// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {IAaveV4Spoke, IAccountRegistry} from "./IAaveV4.sol";
import {SafeToken} from "../libraries/SafeToken.sol";

/// @notice An isolated lending position. No arbitrary calls, delegated borrowing, admin sweep, or pooled debt.
contract StashLendingAccount {
    using SafeToken for address;
    address public immutable vault;
    address public immutable user;
    address public immutable usdc;
    IAaveV4Spoke public immutable pool;
    error Unauthorized();
    constructor(address registry, address borrower, address lendingPool, address debtAsset) {
        vault = registry; user = borrower; pool = IAaveV4Spoke(lendingPool); usdc = debtAsset;
    }
    modifier onlyVault() { if (msg.sender != vault) revert Unauthorized(); _; }
    modifier onlyCredit() { if (msg.sender != IAccountRegistry(vault).stashCredit()) revert Unauthorized(); _; }
    function supply(address asset, uint256 amount) external onlyVault {
        asset.forceApprove(address(pool), amount);
        uint256 reserveId = IAccountRegistry(vault).reserveIdOf(asset);
        pool.supply(reserveId, amount, address(this));
        pool.setUsingAsCollateral(reserveId, true, address(this));
        asset.forceApprove(address(pool), 0);
    }
    function withdraw(address asset, uint256 amount) external onlyVault returns (uint256) {
        (, uint256 actual) = pool.withdraw(IAccountRegistry(vault).reserveIdOf(asset), amount, address(this));
        asset.safeTransfer(user, actual);
        return actual;
    }
    function borrow(uint256 amount, address recipient) external onlyCredit {
        pool.borrow(IAccountRegistry(vault).usdcReserveId(), amount, address(this));
        usdc.safeTransfer(recipient, amount);
    }
    function repay(uint256 amount, address refundTo) external onlyCredit returns (uint256 actual) {
        usdc.forceApprove(address(pool), amount);
        (, actual) = pool.repay(IAccountRegistry(vault).usdcReserveId(), amount, address(this));
        usdc.forceApprove(address(pool), 0);
        if (actual < amount) usdc.safeTransfer(refundTo, amount - actual);
    }
}
