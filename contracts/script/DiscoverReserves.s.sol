// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Script, console2} from "forge-std/Script.sol";
import {IAaveV4Spoke} from "../src/v2/IAaveV4.sol";
interface IReserveCount { function getReserveCount() external view returns(uint256); }
/// @notice Reads the live Aave V4 Spoke on Arc and prints reserve IDs for STASH-supported assets.
/// Usage: forge script script/DiscoverReserves.s.sol --rpc-url https://rpc.mainnet.arc.io
contract DiscoverReserves is Script {
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant WETH = 0x128cC466B61f542da60c70e3aA11c10e19B84EDB;
    address constant cirBTC = 0x171A4217b86A807A64eB94757Db6849fb4bDbAA0;

    function run() external view {
        address spoke = vm.envAddress("AAVE_V4_SPOKE");
        IAaveV4Spoke protocol = IAaveV4Spoke(spoke);
        uint256 count = IReserveCount(spoke).getReserveCount();
        console2.log("=== Aave V4 Spoke Reserve Discovery ===");
        console2.log("Spoke:", spoke);
        console2.log("Chain ID:", block.chainid);
        console2.log("Total reserves:", count);
        console2.log("");

        bool foundUsdc; bool foundWeth; bool foundBtc;
        for (uint256 i; i < count; i++) {
            IAaveV4Spoke.Reserve memory reserve = protocol.getReserve(i);
            if (reserve.underlying == USDC) {
                console2.log("USDC_RESERVE_ID =", i);
                console2.log("  underlying:", reserve.underlying);
                console2.log("  decimals:", reserve.decimals);
                IAaveV4Spoke.ReserveConfig memory cfg = protocol.getReserveConfig(i);
                console2.log("  borrowable:", cfg.borrowable);
                console2.log("  paused:", cfg.paused);
                console2.log("  frozen:", cfg.frozen);
                foundUsdc = true;
            } else if (reserve.underlying == WETH) {
                console2.log("WETH_RESERVE_ID =", i);
                console2.log("  underlying:", reserve.underlying);
                console2.log("  decimals:", reserve.decimals);
                foundWeth = true;
            } else if (reserve.underlying == cirBTC) {
                console2.log("BTC_RESERVE_ID =", i);
                console2.log("  underlying:", reserve.underlying);
                console2.log("  decimals:", reserve.decimals);
                foundBtc = true;
            }
            // Print all reserves for reference
            console2.log("  Reserve", i, "=>", reserve.underlying);
        }
        console2.log("");
        if (!foundUsdc) console2.log("WARNING: USDC reserve NOT found");
        if (!foundWeth) console2.log("WARNING: WETH reserve NOT found");
        if (!foundBtc) console2.log("WARNING: cirBTC reserve NOT found");
        if (foundUsdc && foundWeth && foundBtc) console2.log("All required reserves found. Update .env.mainnet with the IDs above.");
    }
}
