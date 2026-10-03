// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {LaunchFixture} from "../utils/LaunchFixture.sol";
import {FeeHook} from "../../src/FeeHook.sol";
import {LaunchRouter} from "../../src/LaunchRouter.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";

contract FeeHandler is Test {
    FeeHook internal hook;
    LaunchRouter internal router;
    LaunchToken internal token;
    PoolKey internal key;
    address[] public actors;
    address[] public recipients;

    constructor(FeeHook _hook, LaunchRouter _router, LaunchToken _token, PoolKey memory _key, address creator) {
        hook = _hook;
        router = _router;
        token = _token;
        key = _key;
        recipients.push(creator);
        for (uint256 i; i < 4; i++) {
            address a = makeAddr(string(abi.encodePacked("actor", i)));
            actors.push(a);
            recipients.push(a);
            vm.deal(a, 1_000 ether);
        }
    }

    function recipientsLength() external view returns (uint256) {
        return recipients.length;
    }

    function buy(uint256 actorSeed, uint256 amount) external {
        address a = actors[actorSeed % actors.length];
        amount = bound(amount, 1e6, 20 ether);
        vm.prank(a, a);
        router.buy{value: amount}(key, 0, a, block.timestamp);
    }

    function sell(uint256 actorSeed, uint256 fraction) external {
        address a = actors[actorSeed % actors.length];
        uint256 bal = token.balanceOf(a);
        if (bal == 0) return;
        uint256 amount = bal * bound(fraction, 1, 100) / 100;
        vm.startPrank(a, a);
        token.approve(address(router), amount);
        router.sell(key, amount, 0, a, block.timestamp);
        vm.stopPrank();
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
        (address current,,,,,) = hook.poolConfig(key.toId());
        address next = actors[seed % actors.length];
        vm.prank(current);
        hook.transferFeeRecipient(key.toId(), next);
    }
}

contract FeeAccountingInvariantTest is LaunchFixture {
    FeeHandler internal handler;

    function setUp() public override {
        super.setUp();
        (LaunchToken token, PoolKey memory key) = _launchAndOpen();
        handler = new FeeHandler(hook, router, token, key, creator);
        targetContract(address(handler));
    }

    /// The hook's ERC-6909 ETH balance always equals exactly what it owes.
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
}
