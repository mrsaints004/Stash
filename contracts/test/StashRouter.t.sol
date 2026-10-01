// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {StashRouter, ISwapRouter} from "../src/StashRouter.sol";
import {IStashRouter} from "../src/interfaces/IStashRouter.sol";
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

/// @dev Mock StashCredit for testing
contract MockStashCredit {
    mapping(address => uint256) public debtOf;
    mapping(address => uint256) public availableCredit;

    function setDebt(address user, uint256 amount) external {
        debtOf[user] = amount;
    }

    function setAvailableCredit(address user, uint256 amount) external {
        availableCredit[user] = amount;
    }
}

/// @dev Mock Uniswap Router for testing
contract MockSwapRouter is ISwapRouter {
    uint256 public mockOutputAmount;

    function setMockOutput(uint256 amount) external {
        mockOutputAmount = amount;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        override
        returns (uint256 amountOut)
    {
        // Pull tokenIn from caller
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        // Mint tokenOut to recipient
        MockERC20(params.tokenOut).mint(params.recipient, mockOutputAmount);
        return mockOutputAmount;
    }
}

contract StashRouterTest is Test {
    StashRouter public router;
    MockStashCredit public credit;
    MockSwapRouter public swapRouter;
    MockERC20 public usdc;
    MockERC20 public weth;
    MockERC20 public eurc;

    address public alice = makeAddr("alice");
    address public deployer;

    function setUp() public {
        deployer = address(this);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        weth = new MockERC20("Wrapped ETH", "WETH", 18);
        eurc = new MockERC20("Euro Coin", "EURC", 6);

        credit = new MockStashCredit();
        swapRouter = new MockSwapRouter();

        router = new StashRouter(address(credit), address(swapRouter), address(usdc));

        // Add allowed tokens
        router.addAllowedToken(address(usdc));
        router.addAllowedToken(address(weth));

        // Give alice tokens
        usdc.mint(alice, 10000e6);
        weth.mint(alice, 100 ether);

        // Set mock swap output
        swapRouter.setMockOutput(1 ether); // 1 WETH output for any swap
    }

    // --- Swap Tests ---

    function test_swap_success() public {
        vm.startPrank(alice);
        usdc.approve(address(router), 1000e6);
        uint256 amountOut = router.swap(address(usdc), address(weth), 1000e6, 0);
        vm.stopPrank();

        assertEq(amountOut, 1 ether);
        assertEq(weth.balanceOf(alice), 101 ether); // 100 initial + 1 from swap
    }

    function test_swap_collects_fee() public {
        vm.startPrank(alice);
        usdc.approve(address(router), 1000e6);
        router.swap(address(usdc), address(weth), 1000e6, 0);
        vm.stopPrank();

        // Protocol fee = 1000e6 * 30 / 10000 = 3e6 (0.3%)
        uint256 fee = router.collectedFees(address(usdc));
        assertEq(fee, 3e6);
    }

    function test_swap_reverts_zero_amount() public {
        vm.prank(alice);
        vm.expectRevert(StashErrors.ZeroAmount.selector);
        router.swap(address(usdc), address(weth), 0, 0);
    }

    function test_swap_reverts_token_not_allowed() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StashErrors.TokenNotAllowed.selector, address(eurc)));
        router.swap(address(eurc), address(weth), 100e6, 0);
    }

    function test_swap_reverts_output_token_not_allowed() public {
        vm.startPrank(alice);
        usdc.approve(address(router), 1000e6);
        vm.expectRevert(abi.encodeWithSelector(StashErrors.TokenNotAllowed.selector, address(eurc)));
        router.swap(address(usdc), address(eurc), 1000e6, 0);
        vm.stopPrank();
    }

    function test_swap_tracks_position() public {
        vm.startPrank(alice);
        usdc.approve(address(router), 1000e6);
        router.swap(address(usdc), address(weth), 1000e6, 0);
        vm.stopPrank();

        assertEq(router.tradePositions(alice, address(weth)), 1 ether);
    }

    function test_swap_emits_event() public {
        vm.startPrank(alice);
        usdc.approve(address(router), 1000e6);

        vm.expectEmit(true, true, true, true);
        emit IStashRouter.TradeExecuted(alice, address(usdc), address(weth), 1000e6, 1 ether);

        router.swap(address(usdc), address(weth), 1000e6, 0);
        vm.stopPrank();
    }

    // --- Admin Tests ---

    function test_addAllowedToken_success() public {
        router.addAllowedToken(address(eurc));
        assertTrue(router.isAllowedToken(address(eurc)));
    }

    function test_addAllowedToken_reverts_not_owner() public {
        vm.prank(alice);
        vm.expectRevert(StashErrors.NotOwner.selector);
        router.addAllowedToken(address(eurc));
    }

    function test_addAllowedToken_reverts_zero() public {
        vm.expectRevert(StashErrors.ZeroAddress.selector);
        router.addAllowedToken(address(0));
    }

    function test_removeAllowedToken() public {
        router.removeAllowedToken(address(weth));
        assertFalse(router.isAllowedToken(address(weth)));
    }

    function test_withdrawFees() public {
        // Generate fees
        vm.startPrank(alice);
        usdc.approve(address(router), 1000e6);
        router.swap(address(usdc), address(weth), 1000e6, 0);
        vm.stopPrank();

        address treasury = makeAddr("treasury");
        uint256 fees = router.collectedFees(address(usdc));
        router.withdrawFees(address(usdc), treasury);

        assertEq(usdc.balanceOf(treasury), fees);
        assertEq(router.collectedFees(address(usdc)), 0);
    }

    function test_withdrawFees_reverts_zero() public {
        vm.expectRevert(StashErrors.ZeroAmount.selector);
        router.withdrawFees(address(usdc), makeAddr("treasury"));
    }

    function test_withdrawFees_reverts_not_owner() public {
        vm.prank(alice);
        vm.expectRevert(StashErrors.NotOwner.selector);
        router.withdrawFees(address(usdc), alice);
    }
}
