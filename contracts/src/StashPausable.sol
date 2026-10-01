// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {StashErrors} from "./libraries/StashErrors.sol";
import {StashEvents} from "./libraries/StashEvents.sol";

/// @title StashPausable
/// @notice Emergency pause functionality for the Stash protocol.
/// @dev Phase 5 implementation. This is the interface skeleton.
contract StashPausable {
    address public owner;
    bool public paused;

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
