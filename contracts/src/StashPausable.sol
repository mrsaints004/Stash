// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {StashErrors} from "./libraries/StashErrors.sol";
import {StashEvents} from "./libraries/StashEvents.sol";

/// @title StashPausable
/// @notice Emergency pause functionality for the Stash protocol.
/// @dev Shared emergency control, two-step ownership, and reentrancy guard.
contract StashPausable {
    address public owner;
    bool public paused;
    address public pendingOwner;
    uint256 private _entered;
    error ReentrantCall();
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier nonReentrant() {
        if (_entered != 0) revert ReentrantCall();
        _entered = 1;
        _;
        _entered = 0;
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert StashErrors.ZeroAddress();
        pendingOwner = nextOwner;
        emit OwnershipTransferStarted(owner, nextOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert StashErrors.NotOwner();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert StashErrors.NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert StashErrors.Paused();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function pause() external onlyOwner {
        paused = true;
        emit StashEvents.ProtocolPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit StashEvents.ProtocolUnpaused(msg.sender);
    }
}
