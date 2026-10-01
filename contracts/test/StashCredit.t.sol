// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {StashCredit} from "../src/StashCredit.sol";
import {StashVault} from "../src/StashVault.sol";
import {IStashCredit} from "../src/interfaces/IStashCredit.sol";
import {IAaveV4Spoke} from "../src/interfaces/IAaveV4Spoke.sol";
import {StashErrors} from "../src/libraries/StashErrors.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @dev Mock ERC20 for testing
contract MockERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

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

/// @dev Mock Aave Spoke that supports borrow/repay
contract MockAaveSpokeCredit is IAaveV4Spoke {
    MockERC20 public usdc;
    mapping(address => mapping(address => uint256)) public supplied;

    constructor(address _usdc) {
        usdc = MockERC20(_usdc);
    }

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external override {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        supplied[onBehalfOf][asset] += amount;
    }

    function withdraw(address asset, uint256 amount, address to) external override returns (uint256) {
        IERC20(asset).transfer(to, amount);
        return amount;
    }

    function borrow(address asset, uint256 amount, uint256, uint16, address) external override {
        // Mint USDC to the caller (StashCredit contract)
        // In reality, Aave would transfer from its pool
        MockERC20(asset).mint(msg.sender, amount);
    }

    function repay(address asset, uint256 amount, uint256, address) external override returns (uint256) {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        return amount;
    }

    function getUserAccountData(address)
        external
        pure
        override
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        // totalCollateral=100e8, totalDebt=0, availableBorrows=75e6 (USDC 6 dec),
        // liqThreshold=8000, ltv=7500, healthFactor=max
        return (100e8, 0, 75e6, 8000, 7500, type(uint256).max);
    }
}

contract StashCreditTest is Test {
    StashCredit public credit;
    StashVault public vault;
    MockAaveSpokeCredit public aaveSpoke;
    MockERC20 public usdc;
    MockERC20 public weth;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        weth = new MockERC20("Wrapped ETH", "WETH", 18);

        aaveSpoke = new MockAaveSpokeCredit(address(usdc));
        vault = new StashVault(address(aaveSpoke));
        credit = new StashCredit(address(aaveSpoke), address(vault), address(usdc));

        // Setup vault
        vault.addSupportedAsset(address(weth));

        // Give alice some WETH to deposit as collateral
        weth.mint(alice, 100 ether);

        // Give alice some USDC for repayment
        usdc.mint(alice, 1000e6);
    }

    // --- Borrow Tests ---

    function test_borrow_success() public {
        // First deposit collateral
        vm.startPrank(alice);
        weth.approve(address(vault), 10 ether);
        vault.deposit(address(weth), 10 ether);
        vm.stopPrank();

        // Borrow USDC
        vm.prank(alice);
        credit.borrow(100e6); // 100 USDC

        assertEq(credit.debtOf(alice), 100e6);
        assertEq(credit.totalDebt(), 100e6);
        // Alice should have received 100 USDC from the borrow
        // (mock mints to credit contract, then credit transfers to alice)
        assertEq(usdc.balanceOf(alice), 1100e6); // 1000 initial + 100 borrowed
    }

    function test_borrow_multiple() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 10 ether);
        vault.deposit(address(weth), 10 ether);

        credit.borrow(50e6);
        credit.borrow(25e6);
        vm.stopPrank();

        assertEq(credit.debtOf(alice), 75e6);
        assertEq(credit.totalDebt(), 75e6);
    }

    function test_borrow_reverts_zero() public {
        vm.prank(alice);
        vm.expectRevert(StashErrors.ZeroAmount.selector);
        credit.borrow(0);
    }

    function test_borrow_emits_event() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 10 ether);
        vault.deposit(address(weth), 10 ether);

        vm.expectEmit(true, false, false, true);
        emit IStashCredit.Borrowed(alice, 100e6);

        credit.borrow(100e6);
        vm.stopPrank();
    }

    // --- Repay Tests ---

    function test_repay_success() public {
        // Deposit and borrow first
        vm.startPrank(alice);
        weth.approve(address(vault), 10 ether);
        vault.deposit(address(weth), 10 ether);
        credit.borrow(100e6);

        // Repay 50 USDC
        usdc.approve(address(credit), 50e6);
        credit.repay(50e6);
        vm.stopPrank();

        assertEq(credit.debtOf(alice), 50e6);
        assertEq(credit.totalDebt(), 50e6);
    }

    function test_repay_full() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 10 ether);
        vault.deposit(address(weth), 10 ether);
        credit.borrow(100e6);

        // Repay full with type(uint256).max
        usdc.approve(address(credit), type(uint256).max);
        credit.repay(type(uint256).max);
        vm.stopPrank();

        assertEq(credit.debtOf(alice), 0);
        assertEq(credit.totalDebt(), 0);
    }

    function test_repay_caps_at_debt() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 10 ether);
        vault.deposit(address(weth), 10 ether);
        credit.borrow(50e6);

        // Try to repay 100, should only repay 50
        usdc.approve(address(credit), 100e6);
        credit.repay(100e6);
        vm.stopPrank();

        assertEq(credit.debtOf(alice), 0);
    }

    function test_repay_reverts_no_debt() public {
        vm.prank(alice);
        vm.expectRevert(StashErrors.ZeroAmount.selector);
        credit.repay(100e6);
    }

    function test_repay_emits_event() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 10 ether);
        vault.deposit(address(weth), 10 ether);
        credit.borrow(100e6);

        usdc.approve(address(credit), 50e6);

        vm.expectEmit(true, false, false, true);
        emit IStashCredit.Repaid(alice, 50e6);

        credit.repay(50e6);
        vm.stopPrank();
    }

    // --- View Tests ---

    function test_debtOf_zero_for_new_user() public view {
        assertEq(credit.debtOf(bob), 0);
    }

    function test_availableCredit() public view {
        // Mock returns 75e6 available borrows, alice has no debt
        uint256 available = credit.availableCredit(alice);
        assertEq(available, 75e6);
    }

    function test_availableCredit_reduces_with_debt() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 10 ether);
        vault.deposit(address(weth), 10 ether);
        credit.borrow(25e6);
        vm.stopPrank();

        uint256 available = credit.availableCredit(alice);
        assertEq(available, 50e6); // 75e6 - 25e6
    }

    // --- Multiple Users ---

    function test_multiple_users_independent_debt() public {
        // Setup bob
        weth.mint(bob, 50 ether);
        usdc.mint(bob, 500e6);

        // Alice borrows
        vm.startPrank(alice);
        weth.approve(address(vault), 10 ether);
        vault.deposit(address(weth), 10 ether);
        credit.borrow(30e6);
        vm.stopPrank();

        // Bob borrows
        vm.startPrank(bob);
        weth.approve(address(vault), 5 ether);
        vault.deposit(address(weth), 5 ether);
        credit.borrow(20e6);
        vm.stopPrank();

        assertEq(credit.debtOf(alice), 30e6);
        assertEq(credit.debtOf(bob), 20e6);
        assertEq(credit.totalDebt(), 50e6);
    }
}
