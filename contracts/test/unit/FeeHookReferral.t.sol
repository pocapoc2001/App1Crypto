// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Vm} from "forge-std/Vm.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {LaunchFixture} from "../utils/LaunchFixture.sol";
import {FeeHook} from "../../src/FeeHook.sol";
import {LaunchFactory} from "../../src/LaunchFactory.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";

contract FeeHookReferralTest is LaunchFixture {
    LaunchToken internal token;
    PoolKey internal key;
    address internal carol = makeAddr("carol"); // referrer
    address internal dave = makeAddr("dave"); // another referrer

    struct Balances {
        uint256 claims;
        uint256 creator;
        uint256 referrer;
        uint256 protocol;
    }

    function setUp() public override {
        super.setUp();
        (token, key) = _launchAndOpen();
        // alice holds tokens, is not referred yet, and approves the test swapper for the sell paths.
        _buy(alice, key, 5 ether);
        vm.prank(alice);
        token.approve(address(swapper), type(uint256).max);
    }

    function _balances(address referrer) internal view returns (Balances memory) {
        return Balances(_hookClaims(), hook.claimable(creator), hook.claimable(referrer), hook.protocolFeesAccrued());
    }

    /// Creator 50% of the fee (as without referrals), referrer 20% of the other half, protocol the rest.
    function _expectReferralSplit(Balances memory b, address referrer) internal view returns (uint256 fee) {
        fee = _hookClaims() - b.claims;
        assertGt(fee, 0, "fee taken");
        uint256 creatorCut = fee * 5000 / 10_000;
        uint256 referralCut = (fee - creatorCut) * 2000 / 10_000;
        assertEq(hook.claimable(creator) - b.creator, creatorCut, "creator share unchanged");
        assertEq(hook.claimable(referrer) - b.referrer, referralCut, "referrer gets 20% of the protocol cut");
        assertEq(hook.protocolFeesAccrued() - b.protocol, fee - creatorCut - referralCut, "protocol keeps the rest");
    }

    function _expectNoReferralSplit(Balances memory b) internal view {
        uint256 fee = _hookClaims() - b.claims;
        assertGt(fee, 0, "fee taken");
        assertEq(hook.claimable(creator) - b.creator, fee * 5000 / 10_000, "creator share");
        assertEq(hook.protocolFeesAccrued() - b.protocol, fee - fee * 5000 / 10_000, "protocol keeps its whole cut");
    }

    function _countLogs(Vm.Log[] memory logs, bytes32 topic0) internal view returns (uint256 n) {
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(hook) && logs[i].topics[0] == topic0) n++;
        }
    }

    // ---- split with a referrer: all four swap shapes (fee taken in beforeSwap or afterSwap) ---------

    function test_split_withReferrer_exactInputBuy() public {
        Balances memory b = _balances(carol);
        _swapRaw(bob, key, true, -1 ether, 1 ether, abi.encode(carol));
        assertEq(_expectReferralSplit(b, carol), 0.01 ether);
        assertEq(hook.claimable(carol) - b.referrer, 0.001 ether, "0.1% of volume");
        assertEq(hook.referrerOf(bob), carol);
    }

    function test_split_withReferrer_exactOutputBuy() public {
        Balances memory b = _balances(carol);
        _swapRaw(bob, key, true, 1_000_000 ether, 10 ether, abi.encode(carol));
        _expectReferralSplit(b, carol);
        assertEq(hook.referrerOf(bob), carol);
    }

    function test_split_withReferrer_exactInputSell() public {
        Balances memory b = _balances(carol);
        _swapRaw(alice, key, false, -int256(token.balanceOf(alice) / 2), 0, abi.encode(carol));
        _expectReferralSplit(b, carol);
        assertEq(hook.referrerOf(alice), carol);
    }

    function test_split_withReferrer_exactOutputSell() public {
        Balances memory b = _balances(carol);
        _swapRaw(alice, key, false, 0.5 ether, 0, abi.encode(carol));
        assertEq(_expectReferralSplit(b, carol), 0.005 ether);
        assertEq(hook.referrerOf(alice), carol);
    }

    function test_split_withReferrer_router() public {
        Balances memory b = _balances(carol);
        _buy(bob, key, 1 ether, carol);
        _expectReferralSplit(b, carol);

        uint256 tokens = token.balanceOf(bob);
        vm.startPrank(bob, bob);
        token.approve(address(router), tokens);
        b = _balances(carol);
        router.sell(key, tokens, 0, bob, block.timestamp, carol);
        vm.stopPrank();
        _expectReferralSplit(b, carol);
    }

    function test_referralEvents() public {
        vm.expectEmit(true, true, true, true, address(hook));
        emit FeeHook.ReferrerSet(bob, carol);
        vm.expectEmit(true, true, true, true, address(hook));
        emit FeeHook.ReferralFeeAccrued(key.toId(), carol, bob, 0.001 ether);
        _buy(bob, key, 1 ether, carol);
    }

    // ---- no referrer ------------------------------------------------------------------------------

    function test_split_withoutReferrer() public {
        Balances memory b = _balances(carol);
        vm.recordLogs();
        _buy(bob, key, 1 ether);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        _expectNoReferralSplit(b);
        assertEq(hook.protocolFeesAccrued() - b.protocol, 0.005 ether);
        assertEq(hook.referrerOf(bob), address(0));
        assertEq(_countLogs(logs, FeeHook.ReferrerSet.selector), 0);
        assertEq(_countLogs(logs, FeeHook.ReferralFeeAccrued.selector), 0);
    }

    function test_selfReferral_isIgnored() public {
        Balances memory b = _balances(bob);
        vm.recordLogs();
        _buy(bob, key, 1 ether, bob);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        _expectNoReferralSplit(b);
        assertEq(hook.claimable(bob), 0, "no referral cut to yourself");
        assertEq(hook.referrerOf(bob), address(0), "not bound");
        assertEq(_countLogs(logs, FeeHook.ReferrerSet.selector), 0);

        // The ignored self-referral did not use up the binding: a real referrer still sticks later.
        _buy(bob, key, 1 ether, carol);
        assertEq(hook.referrerOf(bob), carol);
    }

    function test_selfReferral_isJudgedByTxOrigin() public {
        // bob pays for a buy that sends the tokens to carol and names carol as referrer: carol is not the trader.
        vm.prank(bob, bob);
        router.buy{value: 1 ether}(key, 0, carol, block.timestamp, carol);
        assertEq(hook.referrerOf(bob), carol);
        assertEq(hook.referrerOf(carol), address(0));
    }

    // ---- sticky binding ---------------------------------------------------------------------------

    function test_sticky_firstReferrerWinsForever() public {
        _buy(bob, key, 1 ether, carol);
        assertEq(hook.referrerOf(bob), carol);

        // A different referrer later: still carol, no new binding event, dave earns nothing.
        Balances memory b = _balances(carol);
        vm.recordLogs();
        _buy(bob, key, 1 ether, dave);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        _expectReferralSplit(b, carol);
        assertEq(hook.claimable(dave), 0);
        assertEq(_countLogs(logs, FeeHook.ReferrerSet.selector), 0);
        assertEq(_countLogs(logs, FeeHook.ReferralFeeAccrued.selector), 1);

        // No referrer passed at all: still carol.
        b = _balances(carol);
        _buy(bob, key, 1 ether);
        _expectReferralSplit(b, carol);

        // Other routers and malformed hookData: still carol.
        b = _balances(carol);
        _swapRaw(bob, key, true, -1 ether, 1 ether, hex"1234");
        _expectReferralSplit(b, carol);

        // Other pools of the same hook: still carol.
        (, PoolKey memory key2) = _launchAndOpen();
        b = _balances(carol);
        _buy(bob, key2, 1 ether, dave);
        _expectReferralSplit(b, carol);
        assertEq(hook.referrerOf(bob), carol);
    }

    function test_sticky_bindsEvenWhenTheFeeRoundsToZero() public {
        Balances memory b = _balances(carol);
        _swapRaw(bob, key, true, -99, 99, abi.encode(carol)); // 1% of 99 wei rounds down to 0
        assertEq(_hookClaims(), b.claims, "no fee");
        assertEq(hook.referrerOf(bob), carol, "still the trader's first referred trade");
    }

    // ---- malformed hookData never reverts and never binds -----------------------------------------

    function test_malformedHookData_isIgnored() public {
        bytes[] memory bad = new bytes[](9);
        bad[0] = "";
        bad[1] = hex"00";
        bad[2] = abi.encodePacked(carol); // 20 bytes: packed, not ABI-encoded
        bad[3] = abi.encodePacked(bytes31(bytes32(abi.encode(carol)))); // 31 bytes
        bad[4] = abi.encodePacked(abi.encode(carol), hex"00"); // 33 bytes
        bad[5] = abi.encode(carol, dave); // 64 bytes
        bad[6] = abi.encode(address(0)); // 32 bytes, zero referrer
        bad[7] = abi.encode(uint256(uint160(carol)) | (1 << 160)); // 32 bytes, dirty upper bits
        bad[8] = abi.encode(type(uint256).max); // 32 bytes, not an address

        for (uint256 i; i < bad.length; i++) {
            Balances memory b = _balances(carol);
            _swapRaw(bob, key, true, -0.1 ether, 0.1 ether, bad[i]); // buy: fee in beforeSwap
            _expectNoReferralSplit(b);
            b = _balances(carol);
            _swapRaw(alice, key, false, -1_000_000 ether, 0, bad[i]); // sell: fee in afterSwap
            _expectNoReferralSplit(b);
            assertEq(hook.claimable(carol), 0);
            assertEq(hook.referrerOf(bob), address(0));
            assertEq(hook.referrerOf(alice), address(0));
        }
    }

    /// Third-party routers can pass anything as hookData: swaps never revert because of it, and only exactly one
    /// clean ABI-encoded address (not zero, not the trader) binds a referrer.
    function testFuzz_arbitraryHookData_neverReverts(bytes calldata data, bool isBuy) public {
        uint256 claimsBefore = _hookClaims();
        if (isBuy) _swapRaw(bob, key, true, -0.1 ether, 0.1 ether, data);
        else _swapRaw(alice, key, false, -1_000_000 ether, 0, data);
        assertGt(_hookClaims(), claimsBefore, "fee still taken");

        address trader = isBuy ? bob : alice;
        address expected;
        if (data.length == 32) {
            uint256 word = uint256(bytes32(data));
            if (word >> 160 == 0 && address(uint160(word)) != trader) expected = address(uint160(word));
        }
        assertEq(hook.referrerOf(trader), expected);
    }

    // ---- claiming ---------------------------------------------------------------------------------

    function test_referrerClaimsEth() public {
        _buy(bob, key, 1 ether, carol);
        _buy(bob, key, 2 ether, dave); // sticky: still carol
        uint256 owed = hook.claimable(carol);
        assertEq(owed, 0.003 ether);
        assertEq(hook.claimable(dave), 0);

        uint256 claimsBefore = _hookClaims();
        vm.expectEmit(true, true, true, true, address(hook));
        emit FeeHook.FeesClaimed(carol, owed);
        vm.prank(bob); // anyone can trigger it, the ETH still goes to the referrer
        assertEq(hook.claimFees(carol), owed);

        assertEq(carol.balance, owed, "paid in ETH");
        assertEq(hook.claimable(carol), 0);
        assertEq(claimsBefore - _hookClaims(), owed);
        assertEq(_hookClaims(), hook.protocolFeesAccrued() + hook.claimable(creator), "claims fully accounted");

        vm.expectRevert(FeeHook.NothingToClaim.selector);
        hook.claimFees(carol);
    }

    function test_creatorAsReferrer_getsBothCuts() public {
        uint256 before = hook.claimable(creator);
        _buy(bob, key, 1 ether, creator); // a creator sharing a link to their own coin
        assertEq(hook.claimable(creator) - before, 0.005 ether + 0.001 ether);
    }

    // ---- launch-time behaviour ----------------------------------------------------------------------

    function test_devBuy_passesNoReferrer_butStickyReferrerStillEarns() public {
        // The factory's dev buy sends empty hookData, so it never binds anyone.
        vm.prank(alice, alice);
        factory.launch{value: 0.01 ether}(LaunchFactory.LaunchParams("A", "A", "", 0));
        assertEq(hook.referrerOf(alice), address(0));

        // A creator who was referred earlier pays their referrer on the dev buy, like on any other trade.
        _buy(bob, key, 1 ether, carol);
        uint256 carolBefore = hook.claimable(carol);
        vm.prank(bob, bob);
        factory.launch{value: 0.01 ether}(LaunchFactory.LaunchParams("B", "B", "", 0));
        assertEq(hook.claimable(carol) - carolBefore, 0.0001 ether * 5000 / 10_000 * 2000 / 10_000);
    }

    function test_referralShare_isSnapshottedPerPool() public {
        LaunchFactory.LaunchConfig memory c = defaultConfig();
        c.referralShareBps = 5000;
        vm.prank(owner);
        factory.setConfig(c);
        (, PoolKey memory key2) = _launchAndOpen();

        _buy(bob, key, 1 ether, carol);
        assertEq(hook.claimable(carol), 0.001 ether, "old pool: 20% of the 0.5% platform cut");
        _buy(bob, key2, 1 ether);
        assertEq(hook.claimable(carol) - 0.001 ether, 0.0025 ether, "new pool: 50% of the 0.5% platform cut");
    }

    function test_registerPool_capsReferralShare() public {
        LaunchToken fake = new LaunchToken("Fake", "FAKE", "", address(this));
        PoolKey memory k = factory.poolKeyFor(address(fake));
        vm.startPrank(address(factory));
        vm.expectRevert(FeeHook.InvalidShare.selector);
        hook.registerPool(k, creator, 100, 5000, 5001, 0, 0);
        hook.registerPool(k, creator, 100, 5000, 5000, 0, 0);
        vm.stopPrank();
        (,,, uint16 referralShare,,,) = hook.poolConfig(k.toId());
        assertEq(referralShare, 5000);
    }

    // ---- fuzz ---------------------------------------------------------------------------------------

    function testFuzz_split_conservesEveryWei(uint96 ethIn, uint16 referralShareBps, bool referred) public {
        ethIn = uint96(bound(ethIn, 1e9, 50 ether));
        referralShareBps = uint16(bound(referralShareBps, 0, 5000));
        LaunchFactory.LaunchConfig memory c = defaultConfig();
        c.referralShareBps = referralShareBps;
        vm.prank(owner);
        factory.setConfig(c);
        (, PoolKey memory k) = _launchAndOpen();
        vm.deal(bob, uint256(ethIn) + 1 ether);

        Balances memory b = _balances(carol);
        _buy(bob, k, ethIn, referred ? carol : address(0));
        uint256 fee = _hookClaims() - b.claims;
        uint256 creatorCut = fee / 2;
        uint256 referralCut = referred ? (fee - creatorCut) * referralShareBps / 10_000 : 0;

        assertEq(fee, uint256(ethIn) / 100);
        assertEq(hook.claimable(creator) - b.creator, creatorCut);
        assertEq(hook.claimable(carol) - b.referrer, referralCut);
        assertEq(hook.protocolFeesAccrued() - b.protocol, fee - creatorCut - referralCut);
        assertEq(_hookClaims(), hook.protocolFeesAccrued() + hook.claimable(creator) + hook.claimable(carol));
    }
}
