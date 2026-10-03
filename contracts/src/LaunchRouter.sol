// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

/// @title LaunchRouter
/// @notice Minimal exact-input router for native-ETH / token v4 pools, plus revert-based quoting.
/// Holds no funds between transactions. Tokens are only ever pulled from msg.sender.
contract LaunchRouter is IUnlockCallback {
    using SafeTransferLib for address;

    IPoolManager public immutable poolManager;
    ISignatureTransfer public immutable permit2;

    enum Pay {
        Eth, // buy, paid with msg.value
        Approval, // sell, tokens pulled with transferFrom (requires approve to this router)
        Permit2, // sell, tokens pulled with a Permit2 signature
        Quote // simulation only, always reverts with the result
    }

    struct Callback {
        PoolKey key;
        bool isBuy;
        uint256 amountIn;
        address payer;
        address recipient;
        Pay pay;
        bytes permitData; // abi.encode(nonce, deadline, signature) when pay == Permit2
    }

    error NotPoolManager();
    error DeadlineExpired();
    error TooLittleReceived(uint256 amountOut, uint256 minAmountOut);
    error ZeroAmount();
    error QuoteResult(uint256 amountIn, uint256 amountOut);
    error UnexpectedQuoteRevert(bytes reason);

    constructor(IPoolManager _poolManager, ISignatureTransfer _permit2) {
        poolManager = _poolManager;
        permit2 = _permit2;
    }

    modifier checkDeadline(uint256 deadline) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        _;
    }

    /// @notice Spend all msg.value on tokens.
    function buy(PoolKey calldata key, uint256 minTokensOut, address recipient, uint256 deadline)
        external
        payable
        checkDeadline(deadline)
        returns (uint256 tokensOut)
    {
        if (msg.value == 0) revert ZeroAmount();
        (uint256 ethPaid, uint256 out) = _swap(Callback(key, true, msg.value, msg.sender, recipient, Pay.Eth, ""));
        if (out < minTokensOut) revert TooLittleReceived(out, minTokensOut);
        if (ethPaid < msg.value) msg.sender.safeTransferETH(msg.value - ethPaid);
        return out;
    }

    /// @notice Sell tokens for ETH. Requires a prior `approve(router, amount)`.
    function sell(PoolKey calldata key, uint256 tokensIn, uint256 minEthOut, address recipient, uint256 deadline)
        external
        checkDeadline(deadline)
        returns (uint256 ethOut)
    {
        if (tokensIn == 0) revert ZeroAmount();
        (, ethOut) = _swap(Callback(key, false, tokensIn, msg.sender, recipient, Pay.Approval, ""));
        if (ethOut < minEthOut) revert TooLittleReceived(ethOut, minEthOut);
    }

    /// @notice Sell tokens for ETH using a Permit2 SignatureTransfer signature (no approve tx needed for
    /// LaunchTokens, which pre-approve Permit2). The permit must be for exactly `tokensIn` of the pool token,
    /// with this router as spender.
    function sellWithPermit(
        PoolKey calldata key,
        uint256 tokensIn,
        uint256 minEthOut,
        address recipient,
        uint256 deadline,
        uint256 permitNonce,
        uint256 permitDeadline,
        bytes calldata signature
    ) external checkDeadline(deadline) returns (uint256 ethOut) {
        if (tokensIn == 0) revert ZeroAmount();
        (, ethOut) = _swap(
            Callback(
                key,
                false,
                tokensIn,
                msg.sender,
                recipient,
                Pay.Permit2,
                abi.encode(permitNonce, permitDeadline, signature)
            )
        );
        if (ethOut < minEthOut) revert TooLittleReceived(ethOut, minEthOut);
    }

    /// @notice Simulate a swap (call with eth_call). Fees and hook rules (anti-snipe) are applied exactly
    /// as in a real swap for the calling tx.origin.
    function quote(PoolKey calldata key, bool isBuy, uint256 amountIn) external returns (uint256 amountOut) {
        try poolManager.unlock(abi.encode(Callback(key, isBuy, amountIn, msg.sender, msg.sender, Pay.Quote, ""))) {
            revert UnexpectedQuoteRevert("");
        } catch (bytes memory reason) {
            if (reason.length == 68 && bytes4(reason) == QuoteResult.selector) {
                assembly ("memory-safe") {
                    amountOut := mload(add(reason, 68))
                }
                return amountOut;
            }
            // Bubble up the real reason (e.g. AntiSnipeLimit, LaunchLocked).
            assembly ("memory-safe") {
                revert(add(reason, 32), mload(reason))
            }
        }
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        Callback memory c = abi.decode(data, (Callback));

        BalanceDelta d = poolManager.swap(
            c.key,
            SwapParams({
                zeroForOne: c.isBuy,
                amountSpecified: -int256(c.amountIn),
                sqrtPriceLimitX96: c.isBuy ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        Currency eth = c.key.currency0;
        Currency token = c.key.currency1;
        uint256 paid;
        uint256 out;
        if (c.isBuy) {
            paid = uint256(uint128(-d.amount0()));
            out = uint256(uint128(d.amount1()));
        } else {
            paid = uint256(uint128(-d.amount1()));
            out = uint256(uint128(d.amount0()));
        }

        if (c.pay == Pay.Quote) revert QuoteResult(paid, out);

        if (c.isBuy) {
            poolManager.settle{value: paid}();
            poolManager.take(token, c.recipient, out);
        } else {
            poolManager.sync(token);
            address tokenAddr = Currency.unwrap(token);
            if (c.pay == Pay.Approval) {
                tokenAddr.safeTransferFrom(c.payer, address(poolManager), paid);
            } else {
                (uint256 nonce, uint256 permitDeadline, bytes memory signature) =
                    abi.decode(c.permitData, (uint256, uint256, bytes));
                permit2.permitTransferFrom(
                    ISignatureTransfer.PermitTransferFrom({
                        permitted: ISignatureTransfer.TokenPermissions({token: tokenAddr, amount: c.amountIn}),
                        nonce: nonce,
                        deadline: permitDeadline
                    }),
                    ISignatureTransfer.SignatureTransferDetails({to: address(poolManager), requestedAmount: paid}),
                    c.payer,
                    signature
                );
            }
            poolManager.settle();
            poolManager.take(eth, c.recipient, out);
        }
        return abi.encode(paid, out);
    }

    function _swap(Callback memory c) internal returns (uint256 paid, uint256 out) {
        bytes memory res = poolManager.unlock(abi.encode(c));
        (paid, out) = abi.decode(res, (uint256, uint256));
    }
}
