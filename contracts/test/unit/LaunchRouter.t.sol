// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {CustomRevert} from "@uniswap/v4-core/src/libraries/CustomRevert.sol";

import {LaunchFixture} from "../utils/LaunchFixture.sol";
import {FeeHook} from "../../src/FeeHook.sol";
import {LaunchRouter} from "../../src/LaunchRouter.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";

contract LaunchRouterTest is LaunchFixture {
    LaunchToken internal token;
    PoolKey internal key;

    function setUp() public override {
        super.setUp();
        (token, key) = _launchAndOpen();
    }

    function test_buy_matchesQuote() public {
        vm.prank(alice, alice);
        uint256 quoted = router.quote(key, true, 1 ether);
        uint256 before = alice.balance;
        uint256 got = _buy(alice, key, 1 ether);
        assertEq(got, quoted);
        assertEq(token.balanceOf(alice), got);
        assertEq(before - alice.balance, 1 ether);
        assertEq(address(router).balance, 0, "router keeps nothing");
    }

    function test_buy_toOtherRecipient() public {
        vm.prank(alice, alice);
        uint256 got = router.buy{value: 0.2 ether}(key, 0, bob, block.timestamp, address(0));
        assertEq(token.balanceOf(bob), got);
        assertEq(token.balanceOf(alice), 0);
    }

    function test_sell_withApproval_matchesQuote() public {
        uint256 tokens = _buy(alice, key, 1 ether);
        vm.prank(alice, alice);
        uint256 quoted = router.quote(key, false, tokens);

        vm.prank(alice);
        token.approve(address(router), tokens);
        uint256 before = alice.balance;
        vm.prank(alice, alice);
        uint256 ethOut = router.sell(key, tokens, quoted, alice, block.timestamp, address(0));

        assertEq(ethOut, quoted);
        assertEq(alice.balance - before, ethOut);
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(address(router)), 0);
    }

    function test_sellWithPermit_noApproveNeeded() public {
        uint256 tokens = _buy(alice, key, 1 ether);
        assertEq(token.allowance(alice, PERMIT2), type(uint256).max, "LaunchToken pre-approves Permit2");

        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signPermit(aliceKey, address(token), tokens, 42, deadline, address(router));
        uint256 before = alice.balance;
        vm.prank(alice, alice);
        uint256 ethOut = router.sellWithPermit(key, tokens, 0, alice, block.timestamp, 42, deadline, sig, address(0));

        assertGt(ethOut, 0);
        assertEq(alice.balance - before, ethOut);
        assertEq(token.balanceOf(alice), 0);

        // Nonce cannot be replayed.
        uint256 more = _buy(alice, key, 0.1 ether);
        vm.prank(alice, alice);
        vm.expectRevert();
        router.sellWithPermit(key, more, 0, alice, block.timestamp, 42, deadline, sig, address(0));
    }

    function test_sellWithPermit_wrongSigner_reverts() public {
        uint256 tokens = _buy(alice, key, 1 ether);
        (, uint256 bobKey) = makeAddrAndKey("bob-signer");
        bytes memory sig = _signPermit(bobKey, address(token), tokens, 1, block.timestamp + 60, address(router));
        vm.prank(alice, alice);
        vm.expectRevert();
        router.sellWithPermit(key, tokens, 0, alice, block.timestamp, 1, block.timestamp + 60, sig, address(0));
    }

    function test_referrer_isSentAsAbiEncodedHookData_orEmpty() public {
        PoolKey memory k = key;
        SwapParams memory p =
            SwapParams({zeroForOne: true, amountSpecified: -1 ether, sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1});
        vm.expectCall(address(hook), abi.encodeCall(IHooks.beforeSwap, (address(router), k, p, bytes(""))));
        _buy(alice, key, 1 ether);

        address ref = makeAddr("ref");
        vm.expectCall(address(hook), abi.encodeCall(IHooks.beforeSwap, (address(router), k, p, abi.encode(ref))));
        _buy(bob, key, 1 ether, ref);
    }

    function test_referrer_forwardedByBuySellAndSellWithPermit() public {
        address ref = makeAddr("ref");

        _buy(alice, key, 1 ether, ref);
        assertEq(hook.referrerOf(alice), ref, "buy");
        uint256 earned = hook.claimable(ref);
        assertEq(earned, 0.001 ether);

        // Each trader below buys without a referrer first, so their referred sell is what binds them.
        uint256 tokens = _buy(bob, key, 1 ether);
        assertEq(hook.referrerOf(bob), address(0));
        vm.startPrank(bob, bob);
        token.approve(address(router), tokens);
        router.sell(key, tokens, 0, bob, block.timestamp, ref);
        vm.stopPrank();
        assertEq(hook.referrerOf(bob), ref, "sell");
        assertGt(hook.claimable(ref), earned);
        earned = hook.claimable(ref);

        (address erin, uint256 erinKey) = makeAddrAndKey("erin");
        vm.deal(erin, 10 ether);
        tokens = _buy(erin, key, 1 ether);
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signPermit(erinKey, address(token), tokens, 7, deadline, address(router));
        vm.prank(erin, erin);
        router.sellWithPermit(key, tokens, 0, erin, block.timestamp, 7, deadline, sig, ref);
        assertEq(hook.referrerOf(erin), ref, "sellWithPermit");
        assertGt(hook.claimable(ref), earned);
    }

    function test_slippage_reverts() public {
        vm.prank(alice, alice);
        uint256 quoted = router.quote(key, true, 1 ether);
        vm.prank(alice, alice);
        vm.expectRevert(abi.encodeWithSelector(LaunchRouter.TooLittleReceived.selector, quoted, quoted + 1));
        router.buy{value: 1 ether}(key, quoted + 1, alice, block.timestamp, address(0));
    }

    function test_deadline_reverts() public {
        vm.prank(alice, alice);
        vm.expectRevert(LaunchRouter.DeadlineExpired.selector);
        router.buy{value: 1 ether}(key, 0, alice, block.timestamp - 1, address(0));
    }

    function test_zeroAmount_reverts() public {
        vm.prank(alice, alice);
        vm.expectRevert(LaunchRouter.ZeroAmount.selector);
        router.buy{value: 0}(key, 0, alice, block.timestamp, address(0));
    }

    function test_quote_bubblesHookErrors() public {
        (, PoolKey memory k) = _launch(creator, 0);
        vm.warp(block.timestamp + 1);
        vm.prank(alice, alice);
        // PoolManager wraps hook reverts; the frontend unwraps `reason` to show a readable message.
        vm.expectRevert(
            abi.encodeWithSelector(
                CustomRevert.WrappedError.selector,
                address(hook),
                IHooks.afterSwap.selector,
                abi.encodeWithSelector(FeeHook.AntiSnipeLimit.selector),
                abi.encodeWithSelector(Hooks.HookCallFailed.selector)
            )
        );
        router.quote(k, true, 1 ether);
    }

    function test_priceCurve_matchesFormula() public {
        // FDV after buying Δ ETH (net of fee) from start F ≈ F·(1 + Δ/F)²
        (, PoolKey memory k) = _launchAndOpen();
        uint256 f = _marketCap(k);
        uint256 ethIn = 3 ether;
        _buy(bob, k, ethIn);
        uint256 net = ethIn * 99 / 100;
        uint256 expected = f * (f + net) / f * (f + net) / f;
        assertApproxEqRel(_marketCap(k), expected, 0.001e18);
    }
}
