// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Immutable contract administration with delayed operations and pause-only emergency control.
/// @dev The administrator and guardian must be deployed multisig contracts; deployment tooling verifies their thresholds.
contract StashTimelock {
    address public immutable administrator;
    address public immutable guardian;
    uint256 public immutable delay;
    mapping(bytes32=>uint256) public readyAt;
    mapping(bytes32=>bool) public executed;
    event Scheduled(bytes32 indexed id,address indexed target,uint256 readyAt);
    event Executed(bytes32 indexed id);
    event Cancelled(bytes32 indexed id);
    error Unauthorized();error InvalidOperation();
    constructor(address admin,address emergencyGuardian,uint256 minimumDelay){
        if(admin.code.length==0||emergencyGuardian.code.length==0||minimumDelay<2 days)revert InvalidOperation();
        administrator=admin;guardian=emergencyGuardian;delay=minimumDelay;
    }
    function operationId(address target,bytes calldata data,bytes32 salt) public view returns(bytes32){return keccak256(abi.encode(block.chainid,address(this),target,data,salt));}
    function schedule(address target,bytes calldata data,bytes32 salt) external returns(bytes32 id){
        if(msg.sender!=administrator)revert Unauthorized();if(target.code.length==0||data.length<4)revert InvalidOperation();
        id=operationId(target,data,salt);if(readyAt[id]!=0||executed[id])revert InvalidOperation();readyAt[id]=block.timestamp+delay;emit Scheduled(id,target,readyAt[id]);
    }
    function cancel(bytes32 id) external {if(msg.sender!=administrator)revert Unauthorized();delete readyAt[id];emit Cancelled(id);}
    function execute(address target,bytes calldata data,bytes32 salt) external {
        bytes32 id=operationId(target,data,salt);if(readyAt[id]==0||block.timestamp<readyAt[id]||executed[id])revert InvalidOperation();
        executed[id]=true;delete readyAt[id];(bool ok,)=target.call(data);if(!ok)revert InvalidOperation();emit Executed(id);
    }
    function emergencyPause(address target) external {
        if(msg.sender!=guardian)revert Unauthorized();(bool ok,)=target.call(abi.encodeWithSignature("pause()"));if(!ok)revert InvalidOperation();
    }
    function acceptProtocolOwnership(address target) external {
        if(msg.sender!=administrator)revert Unauthorized();(bool ok,)=target.call(abi.encodeWithSignature("acceptOwnership()"));if(!ok)revert InvalidOperation();
    }
}
