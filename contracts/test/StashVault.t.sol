// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {StashVault} from "../src/StashVault.sol";
import {IAaveV4Spoke} from "../src/interfaces/IAaveV4Spoke.sol";
import {IStashVault} from "../src/interfaces/IStashVault.sol";
import {StashErrors} from "../src/libraries/StashErrors.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @dev Mock ERC20 for testing
contract MockERC20 is IERC20 {
    string public name = "Mock Token";
    string public symbol = "MOCK";
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Mock Aave V4 Spoke for testing
contract MockAaveSpoke is IAaveV4Spoke {
    mapping(address => mapping(address => uint256)) public supplied;

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external override {
        // Pull token from caller (vault)
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        supplied[onBehalfOf][asset] += amount;
    }

    function withdraw(address asset, uint256 amount, address to) external override returns (uint256) {
        // Send token to user
        IERC20(asset).transfer(to, amount);
        return amount;
    }

    function borrow(address, uint256, uint256, uint16, address) external pure override {
        revert("Not implemented");
    }

    function repay(address, uint256, uint256, address) external pure override returns (uint256) {
        revert("Not implemented");
    }

    function getUserAccountData(address)
        external
        pure
        override
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        return (100e8, 0, 75e8, 8000, 7500, type(uint256).max);
    }
}

contract StashVaultTest is Test {
    StashVault public vault;
    MockAaveSpoke public aaveSpoke;
    MockERC20 public weth;
    MockERC20 public cirBtc;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public deployer;

    function setUp() public {
        deployer = address(this);
        aaveSpoke = new MockAaveSpoke();
        vault = new StashVault(address(aaveSpoke));

        weth = new MockERC20();
        cirBtc = new MockERC20();
        cirBtc.decimals;

        // Add supported assets
        vault.addSupportedAsset(address(weth));
        vault.addSupportedAsset(address(cirBtc));

        // Mint tokens to users
        weth.mint(alice, 100 ether);
        weth.mint(bob, 50 ether);
        cirBtc.mint(alice, 10e8);
    }

    // --- Deposit Tests ---

    function test_deposit_success() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 1 ether);
        vault.deposit(address(weth), 1 ether);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice, address(weth)), 1 ether);
        // Tokens should be in the Aave spoke
        assertEq(weth.balanceOf(address(aaveSpoke)), 1 ether);
    }

    function test_deposit_multiple() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 5 ether);

        vault.deposit(address(weth), 2 ether);
        vault.deposit(address(weth), 3 ether);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice, address(weth)), 5 ether);
    }

    function test_deposit_multiple_assets() public {
        vm.startPrank(alice);

        weth.approve(address(vault), 1 ether);
        vault.deposit(address(weth), 1 ether);

        cirBtc.approve(address(vault), 1e8);
        vault.deposit(address(cirBtc), 1e8);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice, address(weth)), 1 ether);
        assertEq(vault.balanceOf(alice, address(cirBtc)), 1e8);
    }

    function test_deposit_multiple_users() public {
        vm.prank(alice);
        weth.approve(address(vault), 2 ether);
        vm.prank(alice);
        vault.deposit(address(weth), 2 ether);

        vm.prank(bob);
        weth.approve(address(vault), 3 ether);
        vm.prank(bob);
        vault.deposit(address(weth), 3 ether);

        assertEq(vault.balanceOf(alice, address(weth)), 2 ether);
        assertEq(vault.balanceOf(bob, address(weth)), 3 ether);
    }

    function test_deposit_reverts_zero_amount() public {
        vm.prank(alice);
        vm.expectRevert(StashErrors.ZeroAmount.selector);
        vault.deposit(address(weth), 0);
    }

    function test_deposit_reverts_unsupported_asset() public {
        MockERC20 unsupported = new MockERC20();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StashErrors.UnsupportedAsset.selector, address(unsupported)));
        vault.deposit(address(unsupported), 1 ether);
    }

    function test_deposit_emits_event() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 1 ether);

        vm.expectEmit(true, true, false, true);
        emit IStashVault.Deposited(alice, address(weth), 1 ether);

        vault.deposit(address(weth), 1 ether);
        vm.stopPrank();
    }

    // --- Withdraw Tests ---

    function test_withdraw_success() public {
        // Deposit first
        vm.startPrank(alice);
        weth.approve(address(vault), 5 ether);
        vault.deposit(address(weth), 5 ether);

        // Withdraw
        vault.withdraw(address(weth), 2 ether);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice, address(weth)), 3 ether);
        assertEq(weth.balanceOf(alice), 97 ether); // 100 - 5 + 2
    }

    function test_withdraw_full_balance() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 5 ether);
        vault.deposit(address(weth), 5 ether);

        vault.withdraw(address(weth), 5 ether);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice, address(weth)), 0);
        assertEq(weth.balanceOf(alice), 100 ether);
    }

    function test_withdraw_reverts_insufficient_balance() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 1 ether);
        vault.deposit(address(weth), 1 ether);

        vm.expectRevert(
            abi.encodeWithSelector(
                StashErrors.InsufficientBalance.selector, alice, address(weth), 2 ether, 1 ether
            )
        );
        vault.withdraw(address(weth), 2 ether);
        vm.stopPrank();
    }

    function test_withdraw_reverts_zero_amount() public {
        vm.prank(alice);
        vm.expectRevert(StashErrors.ZeroAmount.selector);
        vault.withdraw(address(weth), 0);
    }

    function test_withdraw_cannot_take_others_balance() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 5 ether);
        vault.deposit(address(weth), 5 ether);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(StashErrors.InsufficientBalance.selector, bob, address(weth), 1 ether, 0)
        );
        vault.withdraw(address(weth), 1 ether);
    }

    // --- Admin Tests ---

    function test_addSupportedAsset_onlyOwner() public {
        MockERC20 newToken = new MockERC20();
        vm.prank(alice);
        vm.expectRevert(StashErrors.NotOwner.selector);
        vault.addSupportedAsset(address(newToken));
    }

    function test_removeSupportedAsset() public {
        vault.removeSupportedAsset(address(weth));
        assertFalse(vault.isSupportedAsset(address(weth)));
    }

    function test_getVaultAccountData() public view {
        (uint256 collateral,,,,, uint256 hf) = vault.getVaultAccountData();
        assertEq(collateral, 100e8);
        assertEq(hf, type(uint256).max);
    }
}
