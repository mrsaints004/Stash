// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Test} from "forge-std/Test.sol";
import {StashVault} from "../src/StashVault.sol";
import {StashPausable} from "../src/StashPausable.sol";
import {SafeToken} from "../src/libraries/SafeToken.sol";
import {MockERC20, MockAaveSpokeCredit} from "./StashCredit.t.sol";

contract CallbackToken {
    uint8 public constant decimals = 18;
    StashVault public vault;
    bool public failTransfer;
    bool public reentryBlocked;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function setVault(StashVault target) external { vault = target; }
    function setFailTransfer(bool value) external { failTransfer = value; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) { balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failTransfer) return false;
        if (msg.sender == address(vault)) {
            (bool ok, bytes memory error) = address(vault).call(abi.encodeCall(vault.deposit, (address(this), 1)));
            require(!ok && bytes4(error) == StashPausable.ReentrantCall.selector, "Reentry was not guarded");
            reentryBlocked = true;
        }
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract TokenSafetyTest is Test {
    StashVault vault;
    CallbackToken token;
    function setUp() public {
        MockERC20 usdc = new MockERC20("USDC", "USDC", 6);
        vault = new StashVault(address(new MockAaveSpokeCredit(address(usdc))));
        token = new CallbackToken();
        token.setVault(vault);
        vault.addSupportedAsset(address(token));
        token.mint(address(this), 1 ether);
        token.approve(address(vault), 1 ether);
    }
    function test_tokenCallbackCannotReenterDeposit() public {
        vault.deposit(address(token), 1 ether);
        assertTrue(token.reentryBlocked());
        assertEq(vault.balanceOf(address(this), address(token)), 1 ether);
    }
    function test_falseTransferCannotMintCollateralBalance() public {
        token.setFailTransfer(true);
        vm.expectRevert(abi.encodeWithSelector(SafeToken.TokenCallFailed.selector, address(token)));
        vault.deposit(address(token), 1 ether);
        assertEq(vault.balanceOf(address(this), address(token)), 0);
    }
}
