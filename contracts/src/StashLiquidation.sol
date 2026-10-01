// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IStashVault} from "./interfaces/IStashVault.sol";
import {IStashCredit} from "./interfaces/IStashCredit.sol";
import {IAaveV4Spoke} from "./interfaces/IAaveV4Spoke.sol";
import {StashErrors} from "./libraries/StashErrors.sol";
import {StashEvents} from "./libraries/StashEvents.sol";

/// @title StashLiquidation
/// @notice Enforces liquidation rules when a user's LTV breaches the threshold.
///         Liquidators can repay a user's debt and seize collateral at a discount.
contract StashLiquidation {
    address public owner;
    IStashVault public stashVault;
    IStashCredit public stashCredit;
    IAaveV4Spoke public aaveSpoke;
    address public usdc;

    /// @dev Liquidation threshold in basis points (8000 = 80%)
    uint256 public constant LIQUIDATION_THRESHOLD_BPS = 8000;
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @dev Liquidation bonus for the liquidator (5%)
    uint256 public constant LIQUIDATION_BONUS_BPS = 500;

    /// @dev Max portion of debt that can be liquidated at once (50%)
    uint256 public constant MAX_LIQUIDATION_FACTOR_BPS = 5000;

    /// @dev Whether liquidations are enabled
    bool public liquidationsEnabled;

    modifier onlyOwner() {
        if (msg.sender != owner) revert StashErrors.NotOwner();
        _;
    }

    constructor(
        address _stashVault,
        address _stashCredit,
        address _aaveSpoke,
        address _usdc
    ) {
        owner = msg.sender;
        stashVault = IStashVault(_stashVault);
        stashCredit = IStashCredit(_stashCredit);
        aaveSpoke = IAaveV4Spoke(_aaveSpoke);
        usdc = IERC20(_usdc) == IERC20(_usdc) ? _usdc : _usdc; // store address
        liquidationsEnabled = true;
    }

    /// @notice Liquidate a user's position when LTV exceeds the threshold
    /// @param user The user whose position is at risk
    /// @param collateralAsset The collateral asset to seize
    /// @param debtToRepay The amount of USDC debt to repay on behalf of the user
    function liquidate(
        address user,
        address collateralAsset,
        uint256 debtToRepay
    ) external {
        if (!liquidationsEnabled) revert StashErrors.Paused();
        if (debtToRepay == 0) revert StashErrors.ZeroAmount();

        // Check user is actually liquidatable
        uint256 userDebt = stashCredit.debtOf(user);
        if (userDebt == 0) revert StashErrors.ZeroAmount();

        // Get vault's Aave health data
        (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            ,
            ,
            ,
            uint256 healthFactor
        ) = aaveSpoke.getUserAccountData(address(stashVault));

        // Health factor < 1e18 means position is liquidatable in Aave terms
        // We use our own threshold: LTV > 80%
        if (totalCollateralBase == 0) revert StashErrors.ZeroAmount();
        uint256 currentLtv = (totalDebtBase * BPS_DENOMINATOR) / totalCollateralBase;
        if (currentLtv < LIQUIDATION_THRESHOLD_BPS) {
            revert StashErrors.LTVTooHigh(user, currentLtv);
        }

        // Limit to max liquidation factor
        uint256 maxLiquidatable = (userDebt * MAX_LIQUIDATION_FACTOR_BPS) / BPS_DENOMINATOR;
        if (debtToRepay > maxLiquidatable) {
            debtToRepay = maxLiquidatable;
        }

        // Pull USDC from liquidator
        IERC20(usdc).transferFrom(msg.sender, address(this), debtToRepay);

        // Approve and repay to Aave
        IERC20(usdc).approve(address(aaveSpoke), debtToRepay);
        aaveSpoke.repay(
            usdc,
            debtToRepay,
            2, // variable rate
            address(stashVault)
        );

        // Calculate collateral to seize (debt value + bonus)
        // Collateral value = debtToRepay * (1 + bonus)
        uint256 collateralToSeize = (debtToRepay * (BPS_DENOMINATOR + LIQUIDATION_BONUS_BPS)) / BPS_DENOMINATOR;

        // Withdraw collateral from Aave to the liquidator
        // Note: in practice, the vault would need to authorize this
        aaveSpoke.withdraw(collateralAsset, collateralToSeize, msg.sender);

        emit StashEvents.LiquidationTriggered(user, collateralAsset, debtToRepay, collateralToSeize);
    }

    /// @notice Check if a user's position is liquidatable
    /// @param user The user to check
    /// @return isLiquidatable_ Whether the position can be liquidated
    /// @return currentLtv The current LTV in basis points
    /// @return debt The user's current debt
    function isLiquidatable(address user)
        external
        view
        returns (bool isLiquidatable_, uint256 currentLtv, uint256 debt)
    {
        debt = stashCredit.debtOf(user);
        if (debt == 0) return (false, 0, 0);

        (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            ,
            ,
            ,
        ) = aaveSpoke.getUserAccountData(address(stashVault));

        if (totalCollateralBase == 0) return (true, type(uint256).max, debt);

        currentLtv = (totalDebtBase * BPS_DENOMINATOR) / totalCollateralBase;
        isLiquidatable_ = currentLtv >= LIQUIDATION_THRESHOLD_BPS;
    }

    // --- Admin functions ---

    function setLiquidationsEnabled(bool enabled) external onlyOwner {
        liquidationsEnabled = enabled;
    }

    /// @notice Legacy single-param liquidate kept for interface compatibility
    function liquidate(address user) external {
        // Cannot liquidate with no parameters — use the full liquidate function
        revert("Use liquidate(user, collateralAsset, debtToRepay)");
    }
}
