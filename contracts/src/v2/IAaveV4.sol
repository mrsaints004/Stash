// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
/// @notice Minimal ABI from aave/aave-v4 src/spoke/interfaces/ISpoke.sol.
/// Reserve IDs must be discovered and checked against underlying assets on the deployed Arc Spoke.
interface IAaveV4Spoke {
    struct Reserve { address underlying; address hub; uint16 assetId; uint8 decimals; uint24 collateralRisk; uint8 flags; uint32 dynamicConfigKey; }
    struct ReserveConfig { uint24 collateralRisk; bool paused; bool frozen; bool borrowable; bool receiveSharesEnabled; }
    struct DynamicReserveConfig { uint16 collateralFactor; uint32 maxLiquidationBonus; uint16 liquidationFee; }
    struct UserAccountData { uint256 riskPremium; uint256 avgCollateralFactor; uint256 healthFactor; uint256 totalCollateralValue; uint256 totalDebtValueRay; uint256 activeCollateralCount; uint256 borrowCount; }
    function getReserve(uint256 reserveId) external view returns (Reserve memory);
    function getReserveConfig(uint256 reserveId) external view returns (ReserveConfig memory);
    function getDynamicReserveConfig(uint256 reserveId, uint32 key) external view returns (DynamicReserveConfig memory);
    function getUserSuppliedAssets(uint256 reserveId, address user) external view returns (uint256);
    function getUserTotalDebt(uint256 reserveId, address user) external view returns (uint256);
    function getUserAccountData(address user) external view returns (UserAccountData memory);
    function supply(uint256 reserveId, uint256 amount, address onBehalfOf) external returns (uint256, uint256);
    function withdraw(uint256 reserveId, uint256 amount, address onBehalfOf) external returns (uint256, uint256);
    function borrow(uint256 reserveId, uint256 amount, address onBehalfOf) external returns (uint256, uint256);
    function repay(uint256 reserveId, uint256 amount, address onBehalfOf) external returns (uint256, uint256);
    function setUsingAsCollateral(uint256 reserveId, bool enabled, address onBehalfOf) external;
    function liquidationCall(uint256 collateralReserveId, uint256 debtReserveId, address user, uint256 debtToCover, bool receiveShares) external;
}
interface IAccountRegistry {
    function stashCredit() external view returns (address);
    function reserveIdOf(address asset) external view returns (uint256);
    function usdcReserveId() external view returns (uint256);
}
