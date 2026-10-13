// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {StashCreditTest} from "./StashCredit.t.sol";
import {StashVault} from "../src/StashVault.sol";
import {StashErrors} from "../src/libraries/StashErrors.sol";
import {MockPriceFeed} from "./helpers/MockPriceFeed.sol";

contract ProductionGuardsTest is StashCreditTest {
    function depositAlice() internal {
        vm.startPrank(alice);
        weth.approve(address(vault), 10 ether);
        vault.deposit(address(weth), 10 ether);
        vm.stopPrank();
    }

    function test_cannotBorrowAgainstAnotherUsersCollateral() public {
        depositAlice();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(StashErrors.InsufficientCredit.selector, bob, 1e6, 0));
        credit.borrow(1e6);
    }

    function test_cannotBorrowAbovePersonalLimit() public {
        depositAlice();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StashErrors.InsufficientCredit.selector, alice, 101e6, 100e6));
        credit.borrow(101e6);
    }

    function test_withdrawCannotRemoveBackingForDebt() public {
        depositAlice();
        vm.startPrank(alice);
        credit.borrow(100e6);
        vm.expectRevert(abi.encodeWithSelector(StashErrors.InsufficientCredit.selector, alice, 100e6, 90e6));
        vault.withdraw(address(weth), 1 ether);
        vm.stopPrank();
        assertEq(vault.balanceOf(alice, address(weth)), 10 ether);
    }

    function test_staleOracleBlocksBorrowButNotRepayment() public {
        vm.warp(1000);
        MockPriceFeed feed = new MockPriceFeed();
        vault.configureAssetRisk(address(weth), address(feed), 5000, 7500, 300);
        depositAlice();
        vm.prank(alice);
        credit.borrow(50e6);
        vm.warp(1301);
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(StashVault.InvalidOraclePrice.selector, address(weth)));
        credit.borrow(1e6);
        usdc.approve(address(credit), 50e6);
        credit.repay(50e6);
        vault.withdraw(address(weth), 10 ether);
        vm.stopPrank();
        assertEq(credit.debtOf(alice), 0);
    }

    function test_creditPauseBlocksBorrowAndAllowsRepay() public {
        depositAlice();
        vm.prank(alice);
        credit.borrow(50e6);
        credit.pause();
        vm.startPrank(alice);
        vm.expectRevert(StashErrors.Paused.selector);
        credit.borrow(1e6);
        usdc.approve(address(credit), 50e6);
        credit.repay(50e6);
        vm.stopPrank();
        assertEq(credit.debtOf(alice), 0);
    }

    function test_vaultPauseBlocksDeposit() public {
        vault.pause();
        vm.prank(alice);
        vm.expectRevert(StashErrors.Paused.selector);
        vault.deposit(address(weth), 1 ether);
    }

    function test_ownershipTransferRequiresAcceptance() public {
        vault.transferOwnership(bob);
        assertEq(vault.owner(), address(this));
        vm.prank(alice);
        vm.expectRevert(StashErrors.NotOwner.selector);
        vault.acceptOwnership();
        vm.prank(bob);
        vault.acceptOwnership();
        assertEq(vault.owner(), bob);
    }
}
