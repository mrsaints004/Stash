// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Test} from "forge-std/Test.sol";
import {IAaveV4Spoke} from "../src/v2/IAaveV4.sol";
import {StashVaultV2} from "../src/v2/StashVaultV2.sol";
import {StashCreditV2} from "../src/v2/StashCreditV2.sol";
interface IReserveCount { function getReserveCount() external view returns(uint256); }
/// @notice Read-only upstream compatibility on a live fork. This does not replace a funded user rehearsal.
contract ArcForkTest is Test {
    function test_liveArcReserveDiscoveryAndDebtGetterCompatibility() public {
        string memory endpoint=vm.envOr("ARC_FORK_RPC",string(""));
        if(bytes(endpoint).length==0){vm.skip(true);return;}
        vm.createSelectFork(endpoint);
        require(block.chainid==5042||block.chainid==5042002,"Arc only");
        address spoke=vm.envAddress("AAVE_V4_SPOKE");
        address usdc=0x3600000000000000000000000000000000000000;
        IAaveV4Spoke protocol=IAaveV4Spoke(spoke);uint256 count=IReserveCount(spoke).getReserveCount();
        bool found;uint256 reserveId;
        for(uint256 i;i<count;i++){if(protocol.getReserve(i).underlying==usdc){found=true;reserveId=i;break;}}
        assertTrue(found,"USDC reserve missing");assertEq(protocol.getReserve(reserveId).decimals,6);
        StashVaultV2 vault=new StashVaultV2(spoke,reserveId,usdc);StashCreditV2 credit=new StashCreditV2(address(vault));vault.setStashCredit(address(credit));
        assertEq(credit.debtOf(address(this)),0);
        assertEq(protocol.getUserTotalDebt(reserveId,address(vault)),0);
        IAaveV4Spoke.UserAccountData memory health=protocol.getUserAccountData(address(vault));
        assertEq(health.totalDebtValueRay,0);assertEq(health.healthFactor,type(uint256).max);
    }
}
