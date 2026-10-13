// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Script, console2} from "forge-std/Script.sol";
import {StashVaultV2} from "../src/v2/StashVaultV2.sol";
import {StashCreditV2} from "../src/v2/StashCreditV2.sol";
import {StashRouterV2} from "../src/v2/StashRouterV2.sol";
import {StashLiquidationV2} from "../src/v2/StashLiquidationV2.sol";
import {UsdcFeedAdapter} from "../src/v2/UsdcFeedAdapter.sol";
/// @notice Arc mainnet deployment. Deploys all STASH V2 contracts, paused, with deployer as owner.
///         Migrate to Safe + Timelock ownership post-deployment.
contract DeployMainnet is Script {
    function run() external {
        require(block.chainid == 5042, "Arc mainnet only (chainid 5042)");
        address spoke = vm.envAddress("AAVE_V4_SPOKE");
        address usdc = vm.envAddress("USDC_ADDRESS");
        uint256 usdcReserve = vm.envUint("USDC_RESERVE_ID");
        vm.startBroadcast();
        // Arc's "Capped USDC/USD" feed only has latestAnswer(); wrap it for latestRoundData().
        UsdcFeedAdapter usdcFeed = new UsdcFeedAdapter(vm.envAddress("USDC_USD_FEED"));
        StashVaultV2 vault = new StashVaultV2(spoke, usdcReserve, usdc);
        StashCreditV2 credit = new StashCreditV2(address(vault));
        StashRouterV2 router = new StashRouterV2(address(credit));
        StashLiquidationV2 liquidation = new StashLiquidationV2(address(vault));
        vault.setStashCredit(address(credit)); credit.setRouter(address(router));
        vault.configureAsset(usdc, usdcReserve, address(usdcFeed), uint16(vm.envUint("USDC_FACTOR_BPS")), uint32(vm.envUint("USDC_FEED_MAX_AGE")), true);
        _configure(vault, "WETH"); _configure(vault, "BTC");
        router.configureOutput(vm.envAddress("WETH_ADDRESS"), true);
        router.configureOutput(vm.envAddress("BTC_ADDRESS"), true);
        vault.pause(); credit.pause(); router.pause(); liquidation.pause();
        vm.stopBroadcast();

        console2.log("=== STASH Mainnet Deployment ===");
        console2.log("UsdcFeed    ", address(usdcFeed));
        console2.log("Vault       ", address(vault));
        console2.log("Credit      ", address(credit));
        console2.log("Router      ", address(router));
        console2.log("Liquidation ", address(liquidation));
        console2.log("");
        console2.log("Owner (deployer EOA) retains ownership of all contracts.");
        console2.log("Migrate to Safe + Timelock when ready.");
        console2.log("");
        console2.log("=== Next Steps ===");
        console2.log("1. Verify contracts on Arc explorer");
        console2.log("2. Unpause contracts when ready: vault.unpause(), credit.unpause(), etc.");
        console2.log("3. Configure aggregator routes on router");
        console2.log("4. Deploy Safe multisigs and transfer ownership via transferOwnership()");
    }
    function _configure(StashVaultV2 vault, string memory prefix) internal {
        vault.configureAsset(vm.envAddress(string.concat(prefix,"_ADDRESS")),vm.envUint(string.concat(prefix,"_RESERVE_ID")),
            vm.envAddress(string.concat(prefix,"_USD_FEED")),uint16(vm.envUint(string.concat(prefix,"_FACTOR_BPS"))),uint32(vm.envUint(string.concat(prefix,"_FEED_MAX_AGE"))),true);
    }
}
