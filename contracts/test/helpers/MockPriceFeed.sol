// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
contract MockPriceFeed {
    uint8 public constant decimals = 8;
    int256 public answer = 20e8;
    uint256 public updatedAt;
    constructor() { updatedAt = block.timestamp; }
    function setPrice(int256 price) external { answer = price; updatedAt = block.timestamp; }
    function setTimestamp(uint256 timestamp) external { updatedAt = timestamp; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}
