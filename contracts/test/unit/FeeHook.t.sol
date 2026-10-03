// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

import {LaunchFixture} from "../utils/LaunchFixture.sol";
import {FeeHook} from "../../src/FeeHook.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";

contract FeeHookTest is LaunchFixture {
    LaunchToken internal token;
    PoolKey internal key;

    function setUp() public override {
        super.setUp();
        (token, key) = _launchAndOpen();
        // alice holds tokens + approves the test swapper for sell paths
        _buy(alice, key, 5 ether);
        vm.prank(alice);
        token.approve(address(swapper), type(uint256).max);
    }

    function _expectSplit(uint256 claimsBefore, uint256 creatorBefore, uint256 protocolBefore, uint256 fee)
        internal
        view
    {
        assertEq(_hookClaims() - claimsBefore, fee, "hook claims");
        assertEq(hook.claimable(creator) - creatorBefore, fee * 5000 / 10_000, "creator share");
        assertEq(hook.protocolFeesAccrued() - protocolBefore, fee - fee * 5000 / 10_000, "protocol share");
    }

    // ---- the four swap shapes: fee is always exactly 1% of the ETH leg, taken in ETH ------------

    function test_fee_exactInputBuy() public {
        (uint256 c0, uint256 cr0, uint256 p0) = (_hookClaims(), hook.claimable(creator), hook.protocolFeesAccrued());
        uint256 ethBefore = bob.balance;
        BalanceDelta d = _swapRaw(bob, key, true, -1 ether, 1 ether);
        assertEq(ethBefore - bob.balance, 1 ether, "trader pays exactly amountIn");
        assertEq(d.amount0(), -1 ether);
        assertGt(d.amount1(), 0);
        _expectSplit(c0, cr0, p0, 0.01 ether);
    }

    function test_fee_exactOutputBuy() public {
        (uint256 c0, uint256 cr0, uint256 p0) = (_hookClaims(), hook.claimable(creator), hook.protocolFeesAccrued());
        uint256 ethBefore = bob.balance;
        BalanceDelta d = _swapRaw(bob, key, true, 1_000_000 ether, 10 ether);
        assertEq(d.amount1(), 1_000_000 ether, "exact tokens out");
        uint256 paid = ethBefore - bob.balance;
        assertEq(uint256(uint128(-d.amount0())), paid);
        uint256 fee = _hookClaims() - c0;
        assertEq(fee, (paid - fee) * 100 / 10_000, "1% of ETH that entered the pool");
        _expectSplit(c0, cr0, p0, fee);
    }

    function test_fee_exactInputSell() public {
        (uint256 c0, uint256 cr0, uint256 p0) = (_hookClaims(), hook.claimable(creator), hook.protocolFeesAccrued());
        uint256 ethBefore = alice.balance;
        uint256 tokensIn = token.balanceOf(alice) / 2;
        BalanceDelta d = _swapRaw(alice, key, false, -int256(tokensIn), 0);
        assertEq(uint256(uint128(-d.amount1())), tokensIn);
        uint256 received = alice.balance - ethBefore;
        assertEq(uint256(uint128(d.amount0())), received);
        uint256 fee = _hookClaims() - c0;
        assertEq(fee, (received + fee) * 100 / 10_000, "1% of ETH that left the pool");
        _expectSplit(c0, cr0, p0, fee);
    }

    function test_fee_exactOutputSell() public {
        (uint256 c0, uint256 cr0, uint256 p0) = (_hookClaims(), hook.claimable(creator), hook.protocolFeesAccrued());
        uint256 ethBefore = alice.balance;
        BalanceDelta d = _swapRaw(alice, key, false, 0.5 ether, 0);
        assertEq(alice.balance - ethBefore, 0.5 ether, "exact ETH out");
        assertEq(d.amount0(), 0.5 ether);
        _expectSplit(c0, cr0, p0, 0.005 ether);
    }

    function test_noFeeEverTakenInToken() public {
        _swapRaw(bob, key, true, -1 ether, 1 ether);
        _swapRaw(alice, key, false, -int256(token.balanceOf(alice) / 3), 0);
        assertEq(manager.balanceOf(address(hook), uint256(uint160(address(token)))), 0);
        assertEq(token.balanceOf(address(hook)), 0);
    }

    function test_tradeEvent() public {
        vm.expectEmit(true, true, false, false, address(hook));
        emit FeeHook.Trade(key.toId(), bob, true, 1 ether, 0, 0.01 ether, 0, 0);
        _swapRaw(bob, key, true, -1 ether, 1 ether);
    }

    // ---- claims -------------------------------------------------------------------------------

    function test_claimFees_paysCreatorInEth() public {
        uint256 owed = hook.claimable(creator);
        assertGt(owed, 0);
        uint256 before = creator.balance;
        uint256 claimsBefore = _hookClaims();

        vm.prank(bob); // anyone can trigger, funds still go to the creator
        uint256 paid = hook.claimFees(creator);

        assertEq(paid, owed);
        assertEq(creator.balance - before, owed);
        assertEq(hook.claimable(creator), 0);
        assertEq(claimsBefore - _hookClaims(), owed);

        vm.expectRevert(FeeHook.NothingToClaim.selector);
        hook.claimFees(creator);
    }

    function test_claimProtocolFees_paysTreasury() public {
        uint256 owed = hook.protocolFeesAccrued();
        hook.claimProtocolFees();
        assertEq(treasury.balance, owed);
        assertEq(hook.protocolFeesAccrued(), 0);

        // treasury change is respected
        vm.prank(owner);
        factory.setTreasury(bob);
        _buy(alice, key, 1 ether);
        uint256 bobBefore = bob.balance;
        uint256 owed2 = hook.protocolFeesAccrued();
        hook.claimProtocolFees();
        assertEq(bob.balance - bobBefore, owed2);
    }

    function test_transferFeeRecipient() public {
        PoolId id = key.toId();
        vm.expectRevert(FeeHook.NotFeeRecipient.selector);
        vm.prank(alice);
        hook.transferFeeRecipient(id, alice);

        vm.prank(creator);
        vm.expectRevert(FeeHook.ZeroAddress.selector);
        hook.transferFeeRecipient(id, address(0));

        uint256 creatorOwed = hook.claimable(creator);
        vm.prank(creator);
        hook.transferFeeRecipient(id, bob);

        _buy(alice, key, 1 ether);
        assertEq(hook.claimable(creator), creatorOwed, "old fees stay with old recipient");
        assertEq(hook.claimable(bob), 0.005 ether, "new fees go to new recipient");
    }

    // ---- launch protection ------------------------------------------------------------------

    function test_launchSecond_isLocked_forThirdParties() public {
        (, PoolKey memory k) = _launch(creator, 0);
        vm.expectRevert();
        _buy(alice, k, 0.01 ether);
        // one second later trading opens
        vm.warp(block.timestamp + 1);
        assertGt(_buy(alice, k, 0.01 ether), 0);
    }

    function test_antiSnipe_capsBuysPerWallet() public {
        (, PoolKey memory k) = _launch(creator, 0);
        vm.warp(block.timestamp + 1);
        // 1% of supply cap. ~0.01 ETH buys ~0.66% at a 1.5 ETH start.
        _buy(alice, k, 0.01 ether);
        vm.expectRevert();
        _buy(alice, k, 0.01 ether);
        // another wallet has its own allowance
        assertGt(_buy(bob, k, 0.01 ether), 0);
        // sells are never limited, even inside the window
        LaunchToken t = LaunchToken(Currency.unwrap(k.currency1));
        uint256 aliceTokens = t.balanceOf(alice);
        vm.startPrank(alice, alice);
        t.approve(address(router), aliceTokens);
        assertGt(router.sell(k, aliceTokens, 0, alice, block.timestamp, address(0)), 0);
        vm.stopPrank();
        // after the window, no cap
        vm.warp(block.timestamp + 60);
        assertGt(_buy(alice, k, 1 ether), SUPPLY / 100);
    }

    function test_antiSnipe_doesNotApplyToDevBuy() public {
        (LaunchToken t,) = _launch(creator, 0.07 ether); // ~4.4% of supply, above the 1% sniper cap
        assertGt(t.balanceOf(creator), SUPPLY / 100);
    }

    // ---- fuzz -------------------------------------------------------------------------------

    function testFuzz_buyThenSell_feesAlwaysOnePercent(uint96 ethIn) public {
        ethIn = uint96(bound(ethIn, 1e9, 50 ether));
        vm.deal(bob, uint256(ethIn) + 1 ether);
        uint256 c0 = _hookClaims();
        uint256 tokensOut = _buy(bob, key, ethIn);
        assertEq(_hookClaims() - c0, uint256(ethIn) / 100);

        vm.prank(bob);
        token.approve(address(router), tokensOut);
        uint256 c1 = _hookClaims();
        vm.prank(bob, bob);
        uint256 ethOut = router.sell(key, tokensOut, 0, bob, block.timestamp, address(0));
        uint256 fee = _hookClaims() - c1;
        assertEq(fee, (ethOut + fee) / 100);
        assertLt(ethOut, ethIn, "round trip always loses the fees");

        uint256 sum = hook.protocolFeesAccrued() + hook.claimable(creator);
        assertEq(sum, _hookClaims(), "claims fully accounted");
    }
}
