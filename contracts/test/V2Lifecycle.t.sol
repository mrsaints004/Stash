// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Test} from "forge-std/Test.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {StashVaultV2} from "../src/v2/StashVaultV2.sol";
import {StashCreditV2} from "../src/v2/StashCreditV2.sol";
import {StashRouterV2} from "../src/v2/StashRouterV2.sol";
import {StashLiquidationV2} from "../src/v2/StashLiquidationV2.sol";
import {IAaveV4Spoke} from "../src/v2/IAaveV4.sol";
import {MockPriceFeed} from "./helpers/MockPriceFeed.sol";

contract V2Token {
    uint8 public immutable decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    constructor(uint8 d) { decimals = d; }
    function mint(address user, uint256 amount) external { balanceOf[user] += amount; }
    function burn(address user, uint256 amount) external { balanceOf[user] -= amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) { balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) { allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount; return true; }
}
// V4 reserve-ID/caller-owned ABI test fixture; not evidence of live Arc execution.
contract V4SpokeFixture {
    V2Token public collateral; V2Token public usdc; V2Token public aToken; V2Token public debt; V2Token public usdcAToken;
    bool public unhealthy; address public outputAsset;
    function registerOutput(address output) external { outputAsset=output; }
    constructor(V2Token c, V2Token u) { collateral=c; usdc=u; aToken=new V2Token(18); debt=new V2Token(6); usdcAToken=new V2Token(6); }
    function asset(uint256 id) internal view returns(address) { require(id<3,"reserve"); return id==0?address(usdc):id==1?address(collateral):outputAsset; }
    function getReserve(uint256 id) external view returns(IAaveV4Spoke.Reserve memory) { return IAaveV4Spoke.Reserve(asset(id),address(this),uint16(id),id==0?6:id==1?18:8,0,0,1); }
    function getReserveConfig(uint256) external pure returns(IAaveV4Spoke.ReserveConfig memory) { return IAaveV4Spoke.ReserveConfig(0,false,false,true,true); }
    function getDynamicReserveConfig(uint256,uint32) external pure returns(IAaveV4Spoke.DynamicReserveConfig memory) { return IAaveV4Spoke.DynamicReserveConfig(7500,10500,1000); }
    mapping(address=>bool) public collateralEnabled;
    function setUsingAsCollateral(uint256,bool enabled,address user) external { require(msg.sender==user,"unauthorized"); collateralEnabled[user]=enabled; }
    function getUserSuppliedAssets(uint256 id,address user) external view returns(uint256) { return id==2?0:(id==0?usdcAToken:aToken).balanceOf(user); }
    function getUserTotalDebt(uint256,address user) external view returns(uint256) { return debt.balanceOf(user); }
    function supply(uint256 id,uint256 amount,address user) external returns(uint256,uint256) { require(msg.sender==user,"unauthorized"); IERC20(asset(id)).transferFrom(msg.sender,address(this),amount); (id==0?usdcAToken:aToken).mint(user,amount); return(amount,amount); }
    function withdraw(uint256 id,uint256 amount,address user) external returns(uint256,uint256) { require(msg.sender==user,"unauthorized"); (id==0?usdcAToken:aToken).burn(user,amount); IERC20(asset(id)).transfer(msg.sender,amount); return(amount,amount); }
    function borrow(uint256 id,uint256 amount,address user) external returns(uint256,uint256) { require(msg.sender==user && collateralEnabled[user],"unauthorized"); debt.mint(user,amount); IERC20(asset(id)).transfer(msg.sender,amount); return(amount,amount); }
    function repay(uint256 id,uint256 amount,address user) external returns(uint256,uint256) { require(msg.sender==user,"unauthorized"); uint256 actual=amount>debt.balanceOf(user)?debt.balanceOf(user):amount; IERC20(asset(id)).transferFrom(msg.sender,address(this),actual); debt.burn(user,actual); return(actual,actual); }
    function setUnhealthy(bool state) external { unhealthy=state; }
    function getUserAccountData(address user) external view returns(IAaveV4Spoke.UserAccountData memory) { uint256 value=aToken.balanceOf(user)*20e26/1e18; uint256 debtValue=debt.balanceOf(user)*1e20; return IAaveV4Spoke.UserAccountData(0,75e16,unhealthy?9e17:2e18,value,debtValue*1e27,1,debtValue>0?1:0); }
    function liquidationCall(uint256 collateralId,uint256 debtId,address user,uint256 amount,bool) external { require(unhealthy,"healthy"); uint256 actual=amount>debt.balanceOf(user)?debt.balanceOf(user):amount; IERC20(asset(debtId)).transferFrom(msg.sender,address(this),actual); debt.burn(user,actual); uint256 seized=actual*1e18/20e6*105/100; aToken.burn(user,seized); IERC20(asset(collateralId)).transfer(msg.sender,seized); }

}
contract AggregatorFixture {
    function execute(address input,address output,uint256 sellAmount,uint256 buyAmount,address recipient) external { IERC20(input).transferFrom(msg.sender,address(this),sellAmount); V2Token(output).mint(recipient,buyAmount); }
}
contract V2LifecycleTest is Test {
    V2Token weth; V2Token usdc; V2Token output; V4SpokeFixture pool;
    StashVaultV2 vault; StashCreditV2 credit; StashRouterV2 router; StashLiquidationV2 liquidation;
    MockPriceFeed feed; MockPriceFeed usdcFeed; AggregatorFixture aggregator;
    address alice=makeAddr("alice"); address bob=makeAddr("bob");
    function setUp() public {
        vm.warp(1000); weth=new V2Token(18); usdc=new V2Token(6); output=new V2Token(8);
        pool=new V4SpokeFixture(weth,usdc); pool.registerOutput(address(output)); feed=new MockPriceFeed();
        vault=new StashVaultV2(address(pool),0,address(usdc)); credit=new StashCreditV2(address(vault));
        vault.setStashCredit(address(credit)); vault.configureAsset(address(weth),1,address(feed),5000,300,true);
        usdcFeed=new MockPriceFeed(); usdcFeed.setPrice(1e8); vault.configureAsset(address(usdc),0,address(usdcFeed),5000,300,true);
        MockPriceFeed outputFeed=new MockPriceFeed(); outputFeed.setPrice(50_000_000e8); vault.configureAsset(address(output),2,address(outputFeed),5000,300,false);
        router=new StashRouterV2(address(credit)); credit.setRouter(address(router)); aggregator=new AggregatorFixture();
        router.configureRoute(address(aggregator),address(aggregator),true); router.configureOutput(address(output),true);
        liquidation=new StashLiquidationV2(address(vault)); weth.mint(alice,10 ether); weth.mint(bob,10 ether); usdc.mint(address(pool),10000e6);
        vm.startPrank(alice); weth.approve(address(vault),10 ether); vault.deposit(address(weth),10 ether); vm.stopPrank();
    }
    function test_reserveMismatchCannotConfigureOrDeploy() public {
        vm.expectRevert(StashVaultV2.InvalidConfiguration.selector);
        new StashVaultV2(address(pool),1,address(usdc));
        vm.expectRevert(StashVaultV2.InvalidConfiguration.selector);
        vault.configureAsset(address(weth),0,address(feed),5000,300,true);
    }
    function test_creditUsesActualUsdcPriceAndNativeV4Health() public {
        assertEq(credit.availableCredit(alice),100e6);
        usdcFeed.setPrice(2e8);
        assertEq(credit.availableCredit(alice),50e6);
        (uint256 value,,,,,)=vault.lendingHealth(alice);assertEq(value,200e8);
    }
    function test_staleAndFutureFeedsFreezeCredit() public {
        feed.setTimestamp(block.timestamp-301);
        vm.expectRevert();credit.availableCredit(alice);
        feed.setTimestamp(block.timestamp+1);
        vm.expectRevert();credit.availableCredit(alice);
    }
    function test_oracleGuardRejectsArbitrarilySmallMinimumOutput() public {
        StashRouterV2.Trade memory q=trade(100,address(router));q.minimumOut=1;
        vm.prank(alice);vm.expectRevert(StashRouterV2.InvalidRoute.selector);router.borrowAndSwap(q);assertEq(credit.debtOf(alice),0);
    }
    function trade(uint256 buyAmount,address recipient) internal view returns(StashRouterV2.Trade memory) {
        return StashRouterV2.Trade(address(output),50e6,100,block.timestamp+60,address(aggregator),address(aggregator),abi.encodeCall(aggregator.execute,(address(usdc),address(output),49_850_000,buyAmount,recipient)));
    }
    function test_completeAtomicBorrowTradeRepayWithdraw() public {
        vm.startPrank(alice); router.borrowAndSwap(trade(100,address(router))); assertEq(credit.debtOf(alice),50e6); assertEq(output.balanceOf(alice),100);
        usdc.mint(alice,50e6); usdc.approve(address(credit),50e6); credit.repay(50e6); vault.withdraw(address(weth),10 ether); vm.stopPrank();
        assertEq(credit.debtOf(alice),0); assertEq(vault.balanceOf(alice,address(weth)),0); assertEq(weth.balanceOf(alice),10 ether);
    }
    function test_failedSwapRollsBackDebtAndAllBalances() public {
        vm.prank(alice); vm.expectRevert(StashRouterV2.ExecutionFailed.selector); router.borrowAndSwap(trade(99,address(router)));
        assertEq(credit.debtOf(alice),0); assertEq(router.collectedFees(),0); assertEq(usdc.balanceOf(address(aggregator)),0);
    }
    function test_outputCannotBeRedirectedByCalldata() public {
        vm.prank(alice); vm.expectRevert(StashRouterV2.ExecutionFailed.selector); router.borrowAndSwap(trade(100,bob)); assertEq(credit.debtOf(alice),0);
    }
    function test_personalAccountsAndInterestAreAuthoritative() public {
        vm.prank(alice); credit.borrow(50e6); pool.debt().mint(vault.accounts(alice),1e6); pool.aToken().mint(vault.accounts(alice),1 ether);
        assertEq(credit.debtOf(alice),51e6); assertEq(vault.balanceOf(alice,address(weth)),11 ether); assertEq(credit.debtOf(bob),0);
        vm.prank(bob); vm.expectRevert(); credit.borrow(1e6);
    }
    function test_liquidationUpdatesOnlyTheBorrowersRealTokens() public {
        vm.startPrank(bob); weth.approve(address(vault),10 ether); vault.deposit(address(weth),10 ether); vm.stopPrank();
        vm.prank(alice); credit.borrow(50e6); pool.setUnhealthy(true); usdc.mint(bob,25e6);
        vm.startPrank(bob); usdc.approve(address(liquidation),25e6); liquidation.liquidate(alice,address(weth),25e6,1 ether); vm.stopPrank();
        assertEq(credit.debtOf(alice),25e6); assertEq(credit.debtOf(bob),0); assertEq(vault.balanceOf(bob,address(weth)),10 ether);
        assertEq(vault.balanceOf(alice,address(weth)),10 ether-1.3125 ether);
    }
    function test_healthyLiquidationAndPoorExecutionRevert() public {
        vm.prank(alice); credit.borrow(50e6); usdc.mint(bob,25e6); vm.startPrank(bob); usdc.approve(address(liquidation),25e6);
        vm.expectRevert("healthy"); liquidation.liquidate(alice,address(weth),25e6,1 ether);
        pool.setUnhealthy(true); vm.expectRevert(StashLiquidationV2.InvalidLiquidation.selector); liquidation.liquidate(alice,address(weth),25e6,2 ether); vm.stopPrank(); assertEq(credit.debtOf(alice),50e6);
    }
    function test_disabledDepositsDoNotTrapCollateral() public {
        vault.configureAsset(address(weth),1,address(feed),5000,300,false); vm.prank(alice); vault.withdraw(address(weth),10 ether); assertEq(weth.balanceOf(alice),10 ether);
    }
    function test_repayAndWithdrawRemainAvailableDuringPauseAndOracleOutage() public {
        vm.prank(alice); credit.borrow(50e6); credit.pause(); vault.pause(); feed.setPrice(0);
        usdc.mint(alice,1e6); vm.startPrank(alice); usdc.approve(address(credit),51e6); credit.repay(type(uint256).max); vault.withdraw(address(weth),10 ether); vm.stopPrank(); assertEq(credit.debtOf(alice),0);
    }
    function test_expiredAndUnapprovedRoutesCannotBorrow() public {
        StashRouterV2.Trade memory q=trade(100,address(router)); q.deadline=block.timestamp-1; vm.prank(alice); vm.expectRevert(); router.borrowAndSwap(q);
        q.deadline=block.timestamp+60; router.configureRoute(address(aggregator),address(aggregator),false); vm.prank(alice); vm.expectRevert(); router.borrowAndSwap(q); assertEq(credit.debtOf(alice),0);
    }
    function test_withdrawalCannotLeaveUnbackedDebt() public {
        vm.startPrank(alice); credit.borrow(100e6); vm.expectRevert(); vault.withdraw(address(weth),1 ether); vm.stopPrank(); assertEq(vault.balanceOf(alice,address(weth)),10 ether);
    }
}
