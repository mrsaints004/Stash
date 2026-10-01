// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {StashVault} from "../src/StashVault.sol";
import {StashCredit} from "../src/StashCredit.sol";
import {StashRouter} from "../src/StashRouter.sol";
import {StashLiquidation} from "../src/StashLiquidation.sol";
import {StashPausable} from "../src/StashPausable.sol";

contract Deploy is Script {
    // Arc mainnet addresses
    address constant AAVE_SPOKE = 0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d;
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant WETH = 0x128cC466B61f542da60c70e3aA11c10e19B84EDB;
    address constant CIRBTC = 0x171A4217b86A807A64eB94757Db6849fb4bDbAA0;
    address constant EURC = 0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1;
    address constant UNISWAP_ROUTER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // 1. Deploy StashVault
        StashVault vault = new StashVault(AAVE_SPOKE);
        console2.log("StashVault:", address(vault));

        // 2. Add supported collateral assets
        vault.addSupportedAsset(WETH);
        vault.addSupportedAsset(CIRBTC);

        // 3. Deploy StashCredit
        StashCredit credit = new StashCredit(AAVE_SPOKE, address(vault), USDC);
        console2.log("StashCredit:", address(credit));

        // 4. Set StashCredit on vault (for LTV checks)
        vault.setStashCredit(address(credit));

        // 5. Deploy StashRouter
        StashRouter router = new StashRouter(address(credit), UNISWAP_ROUTER, USDC);
        console2.log("StashRouter:", address(router));

        // 6. Add allowed trading tokens
        router.addAllowedToken(USDC);
        router.addAllowedToken(WETH);
        router.addAllowedToken(CIRBTC);
        router.addAllowedToken(EURC);

        // 7. Deploy StashLiquidation
        StashLiquidation liquidation = new StashLiquidation(
            address(vault),
            address(credit),
            AAVE_SPOKE,
            USDC
        );
        console2.log("StashLiquidation:", address(liquidation));

        // 8. Deploy StashPausable (optional, for emergency)
        StashPausable pausable = new StashPausable();
        console2.log("StashPausable:", address(pausable));

        vm.stopBroadcast();

        // Print summary
        console2.log("--- Deployment Summary ---");
        console2.log("Vault:", address(vault));
        console2.log("Credit:", address(credit));
        console2.log("Router:", address(router));
        console2.log("Liquidation:", address(liquidation));
        console2.log("Pausable:", address(pausable));
    }
}
