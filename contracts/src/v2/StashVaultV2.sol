// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {StashPausable} from "../StashPausable.sol";
import {SafeToken} from "../libraries/SafeToken.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IAaveV4Spoke} from "./IAaveV4.sol";
import {StashLendingAccount} from "./StashLendingAccount.sol";

interface IFeedV2 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}
interface ICreditV2 { function debtOf(address user) external view returns (uint256); }

contract StashVaultV2 is StashPausable {
    using SafeToken for address;
    uint256 public constant version = 2;
    bytes32 public constant lendingAdapter = keccak256("AAVE_V4_SPOKE");
    IAaveV4Spoke public immutable pool;
    uint256 public immutable usdcReserveId;
    address public immutable usdc;
    address public stashCredit;
    mapping(address => address) public accounts;
    address[] public assets;
    struct AssetRisk { uint256 reserveId; address feed; uint8 decimals; uint16 factorBps; uint32 maxAge; bool depositsEnabled; }
    mapping(address => AssetRisk) public assetRisk;
    event AccountCreated(address indexed user, address indexed account);
    event Deposited(address indexed user, address indexed asset, uint256 amount);
    event Withdrawn(address indexed user, address indexed asset, uint256 amount);
    event AssetConfigured(address indexed asset, address indexed feed, uint16 factorBps, uint32 maxAge, bool depositsEnabled);
    event StashCreditSet(address indexed credit);
    error InvalidConfiguration();
    error InvalidPrice(address asset);
    error InsufficientBacking(uint256 debt, uint256 capacity);
    error UnsupportedAsset();

    constructor(address lendingSpoke, uint256 debtReserveId, address debtAsset) {
        if (lendingSpoke.code.length == 0 || debtAsset.code.length == 0 || IERC20(debtAsset).decimals() != 6) revert InvalidConfiguration();
        pool = IAaveV4Spoke(lendingSpoke); usdc = debtAsset; usdcReserveId = debtReserveId;
        if (pool.getReserve(debtReserveId).underlying != debtAsset || !pool.getReserveConfig(debtReserveId).borrowable) revert InvalidConfiguration();
    }
    function reserveIdOf(address asset) public view returns (uint256) {
        if (assetRisk[asset].feed == address(0)) revert UnsupportedAsset();
        return assetRisk[asset].reserveId;
    }
    function setStashCredit(address credit) external onlyOwner {
        if (stashCredit != address(0) || credit.code.length == 0) revert InvalidConfiguration();
        stashCredit = credit;
        emit StashCreditSet(credit);
    }
    function configureAsset(address asset, uint256 reserveId, address feed, uint16 factor, uint32 maxAge, bool enabled) external onlyOwner {
        if (asset.code.length == 0 || feed.code.length == 0 || factor == 0 || factor > 7500 || maxAge == 0) revert InvalidConfiguration();
        IAaveV4Spoke.Reserve memory reserve = pool.getReserve(reserveId);
        IAaveV4Spoke.ReserveConfig memory config = pool.getReserveConfig(reserveId);
        uint256 protocolFactor = pool.getDynamicReserveConfig(reserveId, reserve.dynamicConfigKey).collateralFactor;
        if (reserve.underlying != asset || factor > protocolFactor || (enabled && (config.paused || config.frozen))) revert InvalidConfiguration();
        uint8 decimals = IERC20(asset).decimals();
        if (decimals > 18 || reserve.decimals != decimals) revert InvalidConfiguration();
        if (assetRisk[asset].feed != address(0) && assetRisk[asset].reserveId != reserveId) revert InvalidConfiguration();
        if (assetRisk[asset].feed == address(0)) {
            if (assets.length >= 16) revert InvalidConfiguration();
            assets.push(asset);
        }
        assetRisk[asset] = AssetRisk(reserveId, feed, decimals, factor, maxAge, enabled);
        emit AssetConfigured(asset, feed, factor, maxAge, enabled);
    }
    function assetCount() external view returns (uint256) { return assets.length; }
    function isSupportedAsset(address asset) external view returns (bool) { return assetRisk[asset].depositsEnabled; }
    function deposit(address asset, uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0 || !assetRisk[asset].depositsEnabled || stashCredit == address(0)) revert UnsupportedAsset();
        address account = accounts[msg.sender];
        if (account == address(0)) {
            account = address(new StashLendingAccount(address(this), msg.sender, address(pool), usdc));
            accounts[msg.sender] = account;
            emit AccountCreated(msg.sender, account);
        }
        asset.safeTransferFrom(msg.sender, account, amount);
        StashLendingAccount(account).supply(asset, amount);
        emit Deposited(msg.sender, asset, amount);
    }
    function balanceOf(address user, address asset) public view returns (uint256) {
        address account = accounts[user];
        return account == address(0) || assetRisk[asset].feed == address(0) ? 0 : pool.getUserSuppliedAssets(assetRisk[asset].reserveId, account);
    }
    function priceUsd6(address asset) public view returns (uint256) {
        AssetRisk memory risk = assetRisk[asset];
        if (risk.feed == address(0)) revert UnsupportedAsset();
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = IFeedV2(risk.feed).latestRoundData();
        uint8 decimals = IFeedV2(risk.feed).decimals();
        if (answer <= 0 || updatedAt == 0 || updatedAt > block.timestamp || block.timestamp - updatedAt > risk.maxAge || answeredInRound < roundId || decimals > 18) revert InvalidPrice(asset);
        return uint256(answer) * 1e6 / 10 ** uint256(decimals);
    }
    function borrowingCapacity(address user) public view returns (uint256 capacity) {
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i]; uint256 balance = balanceOf(user, asset);
            if (balance == 0) continue;
            AssetRisk memory risk = assetRisk[asset];
            capacity += balance * priceUsd6(asset) / 10 ** uint256(risk.decimals) * risk.factorBps / 10000;
        }
        // Capacity is denominated in actual USDC units, not an assumed $1 stablecoin price.
        if (capacity != 0) capacity = capacity * 1e6 / priceUsd6(usdc);
    }
    function withdraw(address asset, uint256 amount) external nonReentrant {
        if (amount == 0 || amount > balanceOf(msg.sender, asset)) revert UnsupportedAsset();
        uint256 debt = ICreditV2(stashCredit).debtOf(msg.sender);
        if (debt != 0) {
            AssetRisk memory risk = assetRisk[asset];
            uint256 reduction = amount * priceUsd6(asset) / 10 ** uint256(risk.decimals) * risk.factorBps / 10000 * 1e6 / priceUsd6(usdc);
            uint256 capacity = borrowingCapacity(msg.sender);
            if (reduction > capacity || debt > capacity - reduction) revert InsufficientBacking(debt, reduction > capacity ? 0 : capacity - reduction);
        }
        uint256 actual = StashLendingAccount(accounts[msg.sender]).withdraw(asset, amount);
        emit Withdrawn(msg.sender, asset, actual);
    }
    function lendingHealth(address user) external view returns (uint256 collateralUsd8, uint256 debtUsd8, uint256 availableUsd8, uint256 liquidationThresholdBps, uint256 ltvBps, uint256 healthFactor) {
        if (accounts[user] == address(0)) return (0, 0, 0, 0, 0, type(uint256).max);
        IAaveV4Spoke.UserAccountData memory data = pool.getUserAccountData(accounts[user]);
        // Aave V4 Value has 26 decimals; debt Value is additionally scaled by RAY (27).
        collateralUsd8 = data.totalCollateralValue / 1e18;
        debtUsd8 = data.totalDebtValueRay / 1e45;
        liquidationThresholdBps = data.avgCollateralFactor / 1e14;
        uint256 nativeCapacity = collateralUsd8 * liquidationThresholdBps / 10000;
        availableUsd8 = nativeCapacity > debtUsd8 ? nativeCapacity - debtUsd8 : 0;
        ltvBps = collateralUsd8 == 0 ? 0 : debtUsd8 * 10000 / collateralUsd8;
        healthFactor = data.healthFactor;
    }
}
