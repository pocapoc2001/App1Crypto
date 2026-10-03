// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {LaunchFixture} from "../utils/LaunchFixture.sol";
import {FeeHook} from "../../src/FeeHook.sol";
import {LaunchRouter} from "../../src/LaunchRouter.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";

contract FeeHandler is Test {
    IPoolManager internal manager;
    FeeHook internal hook;
    LaunchRouter internal router;
    LaunchToken internal token;
    PoolKey internal key;
    address[] public actors;
    /// Referrers the handler passes at random: none, outsiders, and the actors themselves (self-referral included).
    address[] public referrerCandidates;
    /// Everyone who can ever be owed fees: the creator, the actors (fee rights can move to them) and the referrers.
    address[] public recipients;

    /// Ghost state: the first valid referrer each actor traded with, and trades whose fee split was wrong.
    mapping(address => address) public firstReferrer;
    uint256 public splitErrors;

    constructor(
        IPoolManager _manager,
        FeeHook _hook,
        LaunchRouter _router,
        LaunchToken _token,
        PoolKey memory _key,
        address creator
    ) {
        manager = _manager;
        hook = _hook;
        router = _router;
        token = _token;
        key = _key;
        recipients.push(creator);
        for (uint256 i; i < 4; i++) {
            address a = makeAddr(string(abi.encodePacked("actor", i)));
            actors.push(a);
            recipients.push(a);
            referrerCandidates.push(a);
            vm.deal(a, 1_000 ether);
        }
        referrerCandidates.push(address(0));
        for (uint256 i; i < 3; i++) {
            address r = makeAddr(string(abi.encodePacked("referrer", i)));
            referrerCandidates.push(r);
            recipients.push(r);
        }
    }

    function recipientsLength() external view returns (uint256) {
        return recipients.length;
    }

    function actorsLength() external view returns (uint256) {
        return actors.length;
    }

    function buy(uint256 actorSeed, uint256 amount, uint256 referrerSeed) external {
        address a = actors[actorSeed % actors.length];
        address r = referrerCandidates[referrerSeed % referrerCandidates.length];
        amount = bound(amount, 1e6, 20 ether);
        (uint256 claims, uint256 protocol, uint256[] memory owed) = _snapshot();
        vm.prank(a, a);
        router.buy{value: amount}(key, 0, a, block.timestamp, r);
        _afterTrade(a, r, claims, protocol, owed);
    }

    function sell(uint256 actorSeed, uint256 fraction, uint256 referrerSeed) external {
        address a = actors[actorSeed % actors.length];
        address r = referrerCandidates[referrerSeed % referrerCandidates.length];
        uint256 bal = token.balanceOf(a);
        if (bal == 0) return;
        uint256 amount = bal * bound(fraction, 1, 100) / 100;
        (uint256 claims, uint256 protocol, uint256[] memory owed) = _snapshot();
        vm.startPrank(a, a);
        token.approve(address(router), amount);
        router.sell(key, amount, 0, a, block.timestamp, r);
        vm.stopPrank();
        _afterTrade(a, r, claims, protocol, owed);
    }

    function claim(uint256 seed) external {
        address r = recipients[seed % recipients.length];
        if (hook.claimable(r) == 0) return;
        hook.claimFees(r);
    }

    function claimProtocol() external {
        if (hook.protocolFeesAccrued() == 0) return;
        hook.claimProtocolFees();
    }

    function transferRecipient(uint256 seed) external {
        (address current,,,,,,) = hook.poolConfig(key.toId());
        address next = actors[seed % actors.length];
        vm.prank(current);
        hook.transferFeeRecipient(key.toId(), next);
    }

    function _snapshot() internal view returns (uint256 claims, uint256 protocol, uint256[] memory owed) {
        claims = manager.balanceOf(address(hook), 0);
        protocol = hook.protocolFeesAccrued();
        owed = new uint256[](recipients.length);
        for (uint256 i; i < recipients.length; i++) {
            owed[i] = hook.claimable(recipients[i]);
        }
    }

    /// Tracks the expected sticky binding and checks this trade's split to the wei. Handler reverts are discarded
    /// (fail_on_revert = false), so mismatches are counted and asserted by an invariant instead.
    function _afterTrade(address trader, address r, uint256 claims, uint256 protocol, uint256[] memory owed) internal {
        if (firstReferrer[trader] == address(0) && r != address(0) && r != trader) firstReferrer[trader] = r;

        uint256 fee = manager.balanceOf(address(hook), 0) - claims;
        (address feeRecipient,, uint16 creatorShareBps, uint16 referralShareBps,,,) = hook.poolConfig(key.toId());
        address ref = hook.referrerOf(trader);
        uint256 creatorCut = fee * creatorShareBps / 10_000;
        uint256 referralCut = ref == address(0) ? 0 : (fee - creatorCut) * referralShareBps / 10_000;

        if (hook.protocolFeesAccrued() - protocol != fee - creatorCut - referralCut) splitErrors++;
        for (uint256 i; i < recipients.length; i++) {
            uint256 expected =
                (recipients[i] == feeRecipient ? creatorCut : 0) + (recipients[i] == ref ? referralCut : 0);
            if (hook.claimable(recipients[i]) - owed[i] != expected) splitErrors++;
        }
    }
}

contract FeeAccountingInvariantTest is LaunchFixture {
    FeeHandler internal handler;

    function setUp() public override {
        super.setUp();
        (LaunchToken token, PoolKey memory key) = _launchAndOpen();
        handler = new FeeHandler(manager, hook, router, token, key, creator);
        targetContract(address(handler));
    }

    /// The hook's ERC-6909 ETH balance always equals exactly what it owes (creators, referrers, protocol).
    function invariant_claimsFullyBacked() public view {
        uint256 owed = hook.protocolFeesAccrued();
        uint256 n = handler.recipientsLength();
        for (uint256 i; i < n; i++) {
            owed += hook.claimable(handler.recipients(i));
        }
        assertEq(manager.balanceOf(address(hook), 0), owed);
    }

    /// The hook never holds raw ETH or tokens; everything sits in the PoolManager as claims.
    function invariant_hookHoldsNoLooseFunds() public view {
        assertEq(address(hook).balance, 0);
        assertEq(address(router).balance, 0);
    }

    /// Every trade split its fee exactly: creator share untouched, referrer share of the protocol cut, rest kept.
    function invariant_everyTradeSplitExactly() public view {
        assertEq(handler.splitErrors(), 0);
    }

    /// A trader's referrer is the first valid one they traded with, never themselves, and never changes.
    function invariant_referralsStickAndAreNeverSelf() public view {
        uint256 n = handler.actorsLength();
        for (uint256 i; i < n; i++) {
            address a = handler.actors(i);
            assertEq(hook.referrerOf(a), handler.firstReferrer(a));
            assertTrue(hook.referrerOf(a) != a);
        }
    }
}
