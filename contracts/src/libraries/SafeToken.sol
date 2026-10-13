// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library SafeToken {
    error TokenCallFailed(address token);

    function callToken(address token, bytes memory data) private {
        if (token.code.length == 0) revert TokenCallFailed(token);
        (bool ok, bytes memory result) = token.call(data);
        if (!ok || (result.length != 0 && (result.length != 32 || !abi.decode(result, (bool))))) {
            revert TokenCallFailed(token);
        }
    }

    function safeTransfer(address token, address to, uint256 amount) internal {
        callToken(token, abi.encodeWithSignature("transfer(address,uint256)", to, amount));
    }

    function safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        callToken(token, abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount));
    }

    function forceApprove(address token, address spender, uint256 amount) internal {
        callToken(token, abi.encodeWithSignature("approve(address,uint256)", spender, 0));
        callToken(token, abi.encodeWithSignature("approve(address,uint256)", spender, amount));
    }
}
