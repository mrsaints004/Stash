// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ICappedFeed {
    function latestAnswer() external view returns (int256);
    function decimals() external pure returns (uint8);
}

/// @notice Wraps Arc's "Capped USDC/USD" feed (which only has latestAnswer) into the
///         latestRoundData interface that StashVaultV2.priceUsd6 expects.
contract UsdcFeedAdapter {
    ICappedFeed public immutable source;

    constructor(address _source) {
        require(_source.code.length != 0, "no bytecode");
        source = ICappedFeed(_source);
    }

    function decimals() external view returns (uint8) {
        return source.decimals();
    }

    function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) {
        answer = source.latestAnswer();
        // The capped feed does not track rounds or timestamps, so we use the current block.
        roundId = 1;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
        answeredInRound = 1;
    }
}
