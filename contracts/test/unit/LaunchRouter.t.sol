// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
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
        uint256 got = router.buy{value: 0.2 ether}(key, 0, bob, block.timestamp);
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
        uint256 ethOut = router.sell(key, tokens, quoted, alice, block.timestamp);

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
        uint256 ethOut = router.sellWithPermit(key, tokens, 0, alice, block.timestamp, 42, deadline, sig);

        assertGt(ethOut, 0);
        assertEq(alice.balance - before, ethOut);
        assertEq(token.balanceOf(alice), 0);

        // Nonce cannot be replayed.
        uint256 more = _buy(alice, key, 0.1 ether);
        vm.prank(alice, alice);
        vm.expectRevert();
        router.sellWithPermit(key, more, 0, alice, block.timestamp, 42, deadline, sig);
    }

    function test_sellWithPermit_wrongSigner_reverts() public {
        uint256 tokens = _buy(alice, key, 1 ether);
        (, uint256 bobKey) = makeAddrAndKey("bob-signer");
        bytes memory sig = _signPermit(bobKey, address(token), tokens, 1, block.timestamp + 60, address(router));
        vm.prank(alice, alice);
        vm.expectRevert();
        router.sellWithPermit(key, tokens, 0, alice, block.timestamp, 1, block.timestamp + 60, sig);
    }

    function test_slippage_reverts() public {
        vm.prank(alice, alice);
        uint256 quoted = router.quote(key, true, 1 ether);
        vm.prank(alice, alice);
        vm.expectRevert(abi.encodeWithSelector(LaunchRouter.TooLittleReceived.selector, quoted, quoted + 1));
        router.buy{value: 1 ether}(key, quoted + 1, alice, block.timestamp);
    }

    function test_deadline_reverts() public {
        vm.prank(alice, alice);
        vm.expectRevert(LaunchRouter.DeadlineExpired.selector);
        router.buy{value: 1 ether}(key, 0, alice, block.timestamp - 1);
    }

    function test_zeroAmount_reverts() public {
        vm.prank(alice, alice);
        vm.expectRevert(LaunchRouter.ZeroAmount.selector);
        router.buy{value: 0}(key, 0, alice, block.timestamp);
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
