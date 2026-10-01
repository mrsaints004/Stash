// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {StashLiquidation} from "../src/StashLiquidation.sol";
import {IAaveV4Spoke} from "../src/interfaces/IAaveV4Spoke.sol";
import {IStashVault} from "../src/interfaces/IStashVault.sol";
import {IStashCredit} from "../src/interfaces/IStashCredit.sol";
import {StashErrors} from "../src/libraries/StashErrors.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @dev Mock ERC20
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

/// @dev Mock StashCredit
contract MockStashCreditLiq is IStashCredit {
    mapping(address => uint256) public debtOf_;

    function setDebt(address user, uint256 amount) external {
        debtOf_[user] = amount;
    }

    function borrow(uint256) external pure override { revert("mock"); }
    function repay(uint256) external pure override { revert("mock"); }
    function debtOf(address user) external view override returns (uint256) { return debtOf_[user]; }
    function availableCredit(address) external pure override returns (uint256) { return 0; }
}

/// @dev Mock StashVault
contract MockStashVaultLiq is IStashVault {
    mapping(address => mapping(address => uint256)) public balances;

    function deposit(address, uint256) external pure override { revert("mock"); }
    function withdraw(address, uint256) external pure override { revert("mock"); }
    function balanceOf(address user, address asset) external view override returns (uint256) {
        return balances[user][asset];
    }
    function isSupportedAsset(address) external pure override returns (bool) { return true; }
}

/// @dev Mock Aave Spoke with configurable LTV
contract MockAaveSpokeLiq is IAaveV4Spoke {
    uint256 public totalCollateral;
    uint256 public totalDebt;
    MockERC20 public weth;
    MockERC20 public usdc;

    constructor(address _weth, address _usdc) {
        weth = MockERC20(_weth);
        usdc = MockERC20(_usdc);
        totalCollateral = 100e8; // $100 in base units
        totalDebt = 85e8; // $85 — LTV = 85% (above 80% threshold)
    }

    function setAccountData(uint256 _collateral, uint256 _debt) external {
        totalCollateral = _collateral;
        totalDebt = _debt;
    }

    function supply(address, uint256, address, uint16) external pure override {}
    function withdraw(address asset, uint256 amount, address to) external override returns (uint256) {
        MockERC20(asset).mint(to, amount);
        return amount;
    }
    function borrow(address, uint256, uint256, uint16, address) external pure override {}
    function repay(address asset, uint256 amount, uint256, address) external override returns (uint256) {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        totalDebt -= amount * 1e2; // scale from 6 dec to 8 dec approximation
        return amount;
    }

    function getUserAccountData(address)
        external
        view
        override
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        uint256 hf = totalDebt > 0 ? (totalCollateral * 1e18) / totalDebt : type(uint256).max;
        return (totalCollateral, totalDebt, 0, 8000, 7500, hf);
    }
}

contract StashLiquidationTest is Test {
    StashLiquidation public liquidation;
    MockStashCreditLiq public credit;
    MockStashVaultLiq public vault;
    MockAaveSpokeLiq public aaveSpoke;
    MockERC20 public usdc;
    MockERC20 public weth;

    address public alice = makeAddr("alice");
    address public liquidator = makeAddr("liquidator");

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        weth = new MockERC20("Wrapped ETH", "WETH", 18);

        credit = new MockStashCreditLiq();
        vault = new MockStashVaultLiq();
        aaveSpoke = new MockAaveSpokeLiq(address(weth), address(usdc));

        liquidation = new StashLiquidation(
            address(vault),
            address(credit),
            address(aaveSpoke),
            address(usdc)
        );

        // Alice has 100 USDC debt
        credit.setDebt(alice, 100e6);

        // Give liquidator USDC
        usdc.mint(liquidator, 1000e6);
    }

    function test_isLiquidatable_true_when_ltv_high() public view {
        (bool canLiquidate, uint256 ltv, uint256 debt) = liquidation.isLiquidatable(alice);
        assertTrue(canLiquidate);
        assertGt(ltv, 8000); // Above 80%
        assertEq(debt, 100e6);
    }

    function test_isLiquidatable_false_when_no_debt() public view {
        (bool canLiquidate,,) = liquidation.isLiquidatable(bob);
        assertFalse(canLiquidate);
    }

    address public bob = makeAddr("bob");

    function test_isLiquidatable_false_when_ltv_safe() public {
        // Set safe LTV: 50% debt/collateral
        aaveSpoke.setAccountData(100e8, 50e8);

        (bool canLiquidate, uint256 ltv,) = liquidation.isLiquidatable(alice);
        assertFalse(canLiquidate);
        assertEq(ltv, 5000); // 50%
    }

    function test_liquidate_success() public {
        vm.startPrank(liquidator);
        usdc.approve(address(liquidation), 50e6);
        liquidation.liquidate(alice, address(weth), 50e6);
        vm.stopPrank();

        // Liquidator should have received collateral (50 * 1.05 = 52.5 USDC worth)
        uint256 expectedCollateral = (50e6 * 10500) / 10000;
        assertEq(weth.balanceOf(liquidator), expectedCollateral);
    }

    function test_liquidate_caps_at_max_factor() public {
        // Alice has 100e6 debt, max liquidation = 50% = 50e6
        vm.startPrank(liquidator);
        usdc.approve(address(liquidation), 100e6);
        // Tries to liquidate 100e6 but should be capped at 50e6
        liquidation.liquidate(alice, address(weth), 100e6);
        vm.stopPrank();

        // Should have only used 50e6 (50% cap)
        uint256 expectedCollateral = (50e6 * 10500) / 10000;
        assertEq(weth.balanceOf(liquidator), expectedCollateral);
    }

    function test_liquidate_reverts_zero_amount() public {
        vm.prank(liquidator);
        vm.expectRevert(StashErrors.ZeroAmount.selector);
        liquidation.liquidate(alice, address(weth), 0);
    }

    function test_liquidate_reverts_no_debt() public {
        vm.prank(liquidator);
        vm.expectRevert(StashErrors.ZeroAmount.selector);
        liquidation.liquidate(bob, address(weth), 50e6);
    }

    function test_liquidate_reverts_when_ltv_safe() public {
        aaveSpoke.setAccountData(100e8, 50e8); // 50% LTV — safe

        vm.startPrank(liquidator);
        usdc.approve(address(liquidation), 50e6);
        vm.expectRevert(abi.encodeWithSelector(StashErrors.LTVTooHigh.selector, alice, 5000));
        liquidation.liquidate(alice, address(weth), 50e6);
        vm.stopPrank();
    }

    function test_liquidate_reverts_when_disabled() public {
        liquidation.setLiquidationsEnabled(false);

        vm.startPrank(liquidator);
        usdc.approve(address(liquidation), 50e6);
        vm.expectRevert(StashErrors.Paused.selector);
        liquidation.liquidate(alice, address(weth), 50e6);
        vm.stopPrank();
    }

    function test_setLiquidationsEnabled_only_owner() public {
        vm.prank(alice);
        vm.expectRevert(StashErrors.NotOwner.selector);
        liquidation.setLiquidationsEnabled(false);
    }
}
