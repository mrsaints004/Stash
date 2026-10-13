// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Script, console2} from "forge-std/Script.sol";
import {StashVaultV2} from "../src/v2/StashVaultV2.sol";
import {StashCreditV2} from "../src/v2/StashCreditV2.sol";
import {StashRouterV2} from "../src/v2/StashRouterV2.sol";
import {StashLiquidationV2} from "../src/v2/StashLiquidationV2.sol";
import {StashTimelock} from "../src/v2/StashTimelock.sol";
interface ISafeConfiguration { function getThreshold() external view returns(uint256); function getOwners() external view returns(address[] memory); }
/// @notice Testnet deployment preparation. Mainnet remains blocked until independent audit and live rehearsal.
contract DeployV2 is Script {
    function run() external {
        require(block.chainid == 5042002, "Arc testnet only: mainnet requires completed release review");
        address spoke = vm.envAddress("AAVE_V4_SPOKE");
        address usdc = vm.envAddress("USDC_ADDRESS");
        uint256 usdcReserve = vm.envUint("USDC_RESERVE_ID");
        address admin = vm.envAddress("STASH_ADMIN_SAFE");
        address guardian = vm.envAddress("STASH_GUARDIAN_SAFE");
        _checkSafe(admin); _checkSafe(guardian);
        // Signing stays in the operator's keystore/hardware wallet; no private-key environment variable.
        vm.startBroadcast();
        StashVaultV2 vault = new StashVaultV2(spoke, usdcReserve, usdc);
        StashCreditV2 credit = new StashCreditV2(address(vault));
        StashRouterV2 router = new StashRouterV2(address(credit));
        StashLiquidationV2 liquidation = new StashLiquidationV2(address(vault));
        StashTimelock timelock = new StashTimelock(admin, guardian, 2 days);
        vault.setStashCredit(address(credit)); credit.setRouter(address(router));
        // Reserve IDs, assets and feeds are explicit, validated against the deployed Spoke.
        vault.configureAsset(usdc, usdcReserve, vm.envAddress("USDC_USD_FEED"), uint16(vm.envUint("USDC_FACTOR_BPS")), uint32(vm.envUint("USDC_FEED_MAX_AGE")), true);
        _configure(vault, "WETH"); _configure(vault, "BTC");
        router.configureOutput(vm.envAddress("WETH_ADDRESS"), true);
        router.configureOutput(vm.envAddress("BTC_ADDRESS"), true);
        // No external route is enabled until target AND spender are independently verified.
        vault.pause(); credit.pause(); router.pause(); liquidation.pause();
        vault.transferOwnership(address(timelock)); credit.transferOwnership(address(timelock));
        router.transferOwnership(address(timelock)); liquidation.transferOwnership(address(timelock));
        vm.stopBroadcast();
        console2.log("Vault", address(vault)); console2.log("Credit", address(credit));
        console2.log("Router", address(router)); console2.log("Liquidation", address(liquidation));
        console2.log("Timelock", address(timelock));
        // The administrator Safe must call timelock.acceptProtocolOwnership for all four modules.
    }
    function _configure(StashVaultV2 vault, string memory prefix) internal {
        vault.configureAsset(vm.envAddress(string.concat(prefix,"_ADDRESS")),vm.envUint(string.concat(prefix,"_RESERVE_ID")),
            vm.envAddress(string.concat(prefix,"_USD_FEED")),uint16(vm.envUint(string.concat(prefix,"_FACTOR_BPS"))),uint32(vm.envUint(string.concat(prefix,"_FEED_MAX_AGE"))),true);
    }
    function _checkSafe(address account) internal view {
        require(account.code.length != 0, "Multisig bytecode required");
        uint256 threshold = ISafeConfiguration(account).getThreshold();
        require(threshold >= 2 && ISafeConfiguration(account).getOwners().length >= threshold, "At least two multisig signatures required");
        // Threshold alone is not proof of Safe implementation: verify proxy, singleton, modules and guards during release review.
    }
}
