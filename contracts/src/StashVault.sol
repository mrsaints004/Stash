// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IStashVault} from "./interfaces/IStashVault.sol";
import {IAaveV4Spoke} from "./interfaces/IAaveV4Spoke.sol";
import {StashErrors} from "./libraries/StashErrors.sol";
import {StashEvents} from "./libraries/StashEvents.sol";

/// @title StashVault
/// @notice Accepts collateral (WETH, cirBTC) and supplies to Aave V4 on behalf of users.
///         The vault holds aTokens on behalf of users. No admin sweep function.
///         Withdrawal is permissionless when LTV allows.
contract StashVault is IStashVault {
    address public owner;
    IAaveV4Spoke public aaveSpoke;
    address public stashCredit;

    /// @dev asset address => is supported
    mapping(address => bool) private _supportedAssets;

    /// @dev user => asset => deposited amount
    mapping(address => mapping(address => uint256)) private _balances;

    /// @dev user => total collateral value in USD (updated by backend/keeper)
    mapping(address => uint256) private _collateralUsd;

    modifier onlyOwner() {
        if (msg.sender != owner) revert StashErrors.NotOwner();
        _;
    }

    constructor(address _aaveSpoke) {
        owner = msg.sender;
        aaveSpoke = IAaveV4Spoke(_aaveSpoke);
    }

    /// @notice Set the StashCredit contract address (for LTV checks on withdrawal)
    function setStashCredit(address _stashCredit) external onlyOwner {
        if (_stashCredit == address(0)) revert StashErrors.ZeroAddress();
        stashCredit = _stashCredit;
    }

    /// @notice Deposit collateral asset into the vault and supply to Aave V4
    /// @param asset The ERC-20 collateral token address (WETH or cirBTC)
    /// @param amount The amount to deposit in the asset's native decimals
    function deposit(address asset, uint256 amount) external override {
        if (amount == 0) revert StashErrors.ZeroAmount();
        if (!_supportedAssets[asset]) revert StashErrors.UnsupportedAsset(asset);

        // Transfer tokens from user to this contract
        IERC20(asset).transferFrom(msg.sender, address(this), amount);

        // Approve Aave Spoke to spend the tokens
        IERC20(asset).approve(address(aaveSpoke), amount);

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
    function withdraw(address asset, uint256 amount) external override {
        if (amount == 0) revert StashErrors.ZeroAmount();
        if (!_supportedAssets[asset]) revert StashErrors.UnsupportedAsset(asset);

        uint256 userBalance = _balances[msg.sender][asset];
        if (amount > userBalance) {
            revert StashErrors.InsufficientBalance(msg.sender, asset, amount, userBalance);
        }

        // Update balance before external calls (checks-effects-interactions)
        _balances[msg.sender][asset] = userBalance - amount;

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
        _supportedAssets[asset] = true;
        emit StashEvents.AssetAdded(asset);
    }

    function removeSupportedAsset(address asset) external onlyOwner {
        _supportedAssets[asset] = false;
        emit StashEvents.AssetRemoved(asset);
    }
}
