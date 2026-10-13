// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Test} from "forge-std/Test.sol";
import {StashTimelock} from "../src/v2/StashTimelock.sol";
import {StashPausable} from "../src/StashPausable.sol";
contract GovernanceFixture {}
contract ParameterFixture is StashPausable { uint256 public parameter; function setParameter(uint256 value) external onlyOwner { parameter=value; } }
contract TimelockTest is Test {
    StashTimelock lock; ParameterFixture target; address admin; address guardian;
    function setUp() public { admin=address(new GovernanceFixture()); guardian=address(new GovernanceFixture()); lock=new StashTimelock(admin,guardian,2 days); target=new ParameterFixture(); target.transferOwnership(address(lock)); vm.prank(admin); lock.acceptProtocolOwnership(address(target)); }
    function test_changesRequireAdminAndDelayAndCannotReplay() public {
        bytes memory data=abi.encodeCall(target.setParameter,(42)); bytes32 salt=keccak256("change");
        vm.expectRevert(StashTimelock.Unauthorized.selector); lock.schedule(address(target),data,salt);
        vm.prank(admin); lock.schedule(address(target),data,salt);
        vm.expectRevert(StashTimelock.InvalidOperation.selector); lock.execute(address(target),data,salt);
        vm.warp(block.timestamp+2 days); lock.execute(address(target),data,salt); assertEq(target.parameter(),42);
        vm.expectRevert(StashTimelock.InvalidOperation.selector); lock.execute(address(target),data,salt);
    }
    function test_guardianCanPauseButCannotUnpauseOrConfigure() public {
        vm.prank(guardian); lock.emergencyPause(address(target)); assertTrue(target.paused());
        vm.prank(guardian); vm.expectRevert(); target.unpause();
        vm.prank(guardian); vm.expectRevert(StashTimelock.Unauthorized.selector); lock.schedule(address(target),abi.encodeCall(target.unpause,()),bytes32(0));
    }
    function test_cancelPreventsExecution() public {
        bytes memory data=abi.encodeCall(target.setParameter,(42));
        vm.prank(admin); bytes32 id=lock.schedule(address(target),data,bytes32(0));
        vm.prank(admin); lock.cancel(id); vm.warp(block.timestamp+2 days);
        vm.expectRevert(StashTimelock.InvalidOperation.selector); lock.execute(address(target),data,bytes32(0));
    }
}
