// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
// Legacy V1 retained for regression tests. Not a supported Arc deployment; use src/v2/.

import {StashPausable} from "./StashPausable.sol";
import {SafeToken} from "./libraries/SafeToken.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IStashCredit} from "./interfaces/IStashCredit.sol";
import {IStashVault} from "./interfaces/IStashVault.sol";
import {IAaveV4Spoke} from "./interfaces/IAaveV4Spoke.sol";
import {StashErrors} from "./libraries/StashErrors.sol";
import {StashEvents} from "./libraries/StashEvents.sol";

/// @title StashVault
/// @notice Accepts collateral (WETH, cirBTC) and supplies to Aave V4 on behalf of users.
///         The vault holds aTokens on behalf of users. No admin sweep function.
///         Withdrawal is permissionless when LTV allows.
interface IPriceFeed {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

contract StashVault is IStashVault, StashPausable {
    using SafeToken for address;
    IAaveV4Spoke public aaveSpoke;
    address public stashCredit;

    /// @dev asset address => is supported
    mapping(address => bool) private _supportedAssets;

    /// @dev user => asset => deposited amount
    mapping(address => mapping(address => uint256)) private _balances;

    /// @dev user => total collateral value in USD (updated by backend/keeper)
    struct AssetRisk { address feed; uint8 decimals; uint16 collateralFactorBps; uint16 liquidationThresholdBps; uint32 maxAge; }
    mapping(address => AssetRisk) public assetRisk;
    address[] public assets;
    mapping(address => bool) private _listed;
    error InvalidRiskConfiguration();
    error InvalidOraclePrice(address asset);
    event AssetRiskConfigured(address indexed asset, address indexed feed, uint16 collateralFactorBps, uint16 liquidationThresholdBps, uint32 maxAge);

    function configureAssetRisk(address asset, address feed, uint16 factor, uint16 threshold, uint32 maxAge) external onlyOwner {
        if (!_supportedAssets[asset] || feed.code.length == 0 || factor == 0 || factor >= threshold || threshold > 10000 || maxAge == 0) revert InvalidRiskConfiguration();
        uint8 decimals = IERC20(asset).decimals();
        if (decimals > 18) revert InvalidRiskConfiguration();
        assetRisk[asset] = AssetRisk(feed, decimals, factor, threshold, maxAge);
        emit AssetRiskConfigured(asset, feed, factor, threshold, maxAge);
    }

    /// @notice Per-user borrowing limit in USDC atomic units, using validated independent oracle prices.
    function borrowingCapacity(address user) external view returns (uint256 capacity) {
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 balance = _balances[user][asset];
            if (balance == 0 || !_supportedAssets[asset]) continue;
            AssetRisk memory risk = assetRisk[asset];
            if (risk.feed == address(0)) revert InvalidRiskConfiguration();
            (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = IPriceFeed(risk.feed).latestRoundData();
            uint8 priceDecimals = IPriceFeed(risk.feed).decimals();
            if (answer <= 0 || updatedAt == 0 || updatedAt > block.timestamp || block.timestamp - updatedAt > risk.maxAge || answeredInRound < roundId || priceDecimals > 18) revert InvalidOraclePrice(asset);
            uint256 usd6 = balance * uint256(answer) * 1e6 / (10 ** uint256(risk.decimals)) / (10 ** uint256(priceDecimals));
            capacity += usd6 * risk.collateralFactorBps / 10000;
        }
    }

    constructor(address _aaveSpoke) {
        aaveSpoke = IAaveV4Spoke(_aaveSpoke);
    }

    /// @notice Set the StashCredit contract address (for LTV checks on withdrawal)
    function setStashCredit(address _stashCredit) external onlyOwner {
        if (_stashCredit == address(0)) revert StashErrors.ZeroAddress();
        if (stashCredit != address(0)) revert InvalidRiskConfiguration();
        stashCredit = _stashCredit;
    }

    /// @notice Deposit collateral asset into the vault and supply to Aave V4
    /// @param asset The ERC-20 collateral token address (WETH or cirBTC)
    /// @param amount The amount to deposit in the asset's native decimals
    function deposit(address asset, uint256 amount) external override whenNotPaused nonReentrant {
        if (amount == 0) revert StashErrors.ZeroAmount();
        if (!_supportedAssets[asset]) revert StashErrors.UnsupportedAsset(asset);

        // Transfer tokens from user to this contract
        asset.safeTransferFrom(msg.sender, address(this), amount);

        // Approve Aave Spoke to spend the tokens
        asset.forceApprove(address(aaveSpoke), amount);

        // Supply to Aave V4 on behalf of this contract (vault holds aTokens)
        aaveSpoke.supply(asset, amount, address(this), 0);

        // Track per-user deposit
        _balances[msg.sender][asset] += amount;

        emit Deposited(msg.sender, asset, amount);
        emit StashEvents.CollateralDeposited(msg.sender, asset, amount);
    }

    /// @notice Withdraw collateral from the vault
    /// @param asset The ERC-20 collateral token address
    /// @param amount The amount to withdraw
    function withdraw(address asset, uint256 amount) external override nonReentrant {
        if (amount == 0) revert StashErrors.ZeroAmount();
        if (!_supportedAssets[asset]) revert StashErrors.UnsupportedAsset(asset);

        uint256 userBalance = _balances[msg.sender][asset];
        if (amount > userBalance) {
            revert StashErrors.InsufficientBalance(msg.sender, asset, amount, userBalance);
        }

        // Update balance before external calls (checks-effects-interactions)
        _balances[msg.sender][asset] = userBalance - amount;

        if (stashCredit != address(0)) {
            uint256 debt = IStashCredit(stashCredit).debtOf(msg.sender);
            if (debt > 0) {
                uint256 capacity = this.borrowingCapacity(msg.sender);
                if (debt > capacity) revert StashErrors.InsufficientCredit(msg.sender, debt, capacity);
            }
        }

        // Withdraw from Aave V4 — tokens go directly to the user
        aaveSpoke.withdraw(asset, amount, msg.sender);

        emit Withdrawn(msg.sender, asset, amount);
        emit StashEvents.CollateralWithdrawn(msg.sender, asset, amount);
    }

    /// @notice Get a user's deposited balance for an asset
    function balanceOf(address user, address asset) external view override returns (uint256) {
        return _balances[user][asset];
    }

    /// @notice Check if an asset is supported as collateral
    function isSupportedAsset(address asset) external view override returns (bool) {
        return _supportedAssets[asset];
    }

    /// @notice Get Aave account data for this vault (all collateral)
    function getVaultAccountData()
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {
        return aaveSpoke.getUserAccountData(address(this));
    }

    // --- Admin functions ---

    function addSupportedAsset(address asset) external onlyOwner {
        if (asset == address(0)) revert StashErrors.ZeroAddress();
        if (!_listed[asset]) {
            if (assets.length >= 16) revert InvalidRiskConfiguration();
            assets.push(asset);
            _listed[asset] = true;
        }
        _supportedAssets[asset] = true;
        emit StashEvents.AssetAdded(asset);
    }

    function removeSupportedAsset(address asset) external onlyOwner {
        _supportedAssets[asset] = false;
        emit StashEvents.AssetRemoved(asset);
    }
}
