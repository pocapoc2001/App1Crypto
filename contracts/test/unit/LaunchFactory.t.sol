// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {Ownable} from "solady/auth/Ownable.sol";

import {LaunchFixture} from "../utils/LaunchFixture.sol";
import {FeeHook} from "../../src/FeeHook.sol";
import {LaunchFactory} from "../../src/LaunchFactory.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";

contract LaunchFactoryTest is LaunchFixture {
    using StateLibrary for IPoolManager;

    function test_launch_createsTokenPoolAndLockedLiquidity() public {
        (LaunchToken token, PoolKey memory key) = _launch(creator, 0);

        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.name(), "Test Coin");
        assertEq(token.symbol(), "TEST");
        assertEq(token.metadataURI(), "ipfs://meta");
        assertEq(token.balanceOf(address(factory)), 0, "factory keeps nothing");
        // Everything except rounding dust sits in the pool.
        uint256 inPool = token.balanceOf(address(manager));
        assertApproxEqAbs(inPool, SUPPLY, 1e6);
        assertEq(inPool + token.balanceOf(address(0xdEaD)), SUPPLY);

        (uint160 sqrtPriceX96, int24 tick,,) = IPoolManager(address(manager)).getSlot0(key.toId());
        assertGt(sqrtPriceX96, 0);
        assertEq(tick % 200, 0);
        // Price starts exactly at the top of the range (all tokens, no ETH): the position becomes
        // active as soon as the first buy pushes the price into it.
        assertEq(IPoolManager(address(manager)).getLiquidity(key.toId()), 0, "range starts just out of range");
        vm.warp(block.timestamp + 1);
        _buy(alice, key, 0.001 ether);
        assertGt(IPoolManager(address(manager)).getLiquidity(key.toId()), 0, "active after first buy");

        (address infoCreator, PoolId infoPool, uint40 launchedAt) = factory.tokenInfo(address(token));
        assertEq(infoCreator, creator);
        assertEq(PoolId.unwrap(infoPool), PoolId.unwrap(key.toId()));
        assertEq(launchedAt, START_TIME);
        assertEq(factory.launchCount(), 1);

        (address recipient, uint16 feeBps, uint16 share,,,) = hook.poolConfig(key.toId());
        assertEq(recipient, creator);
        assertEq(feeBps, 100);
        assertEq(share, 5000);
    }

    function test_launch_startingMarketCapMatchesConfig() public {
        (, PoolKey memory key) = _launch(creator, 0);
        uint256 mcap = _marketCap(key);
        // Tick is floored to spacing 200 -> mcap is at most ~2% above the configured value.
        assertGe(mcap, 1.5 ether);
        assertLe(mcap, 1.5 ether * 1021 / 1000);
    }

    function test_launch_liquidityCannotBeRemovedByAnyone() public {
        (, PoolKey memory key) = _launch(creator, 0);
        (, int24 tick,,) = IPoolManager(address(manager)).getSlot0(key.toId());
        PoolModifyLiquidityTest lp = new PoolModifyLiquidityTest(manager);
        // Positions are keyed by owner: another contract cannot touch the factory's position.
        vm.expectRevert();
        lp.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: TickMath.minUsableTick(200), tickUpper: tick, liquidityDelta: -1e18, salt: bytes32(0)
            }),
            ""
        );
    }

    function test_launch_devBuy_sendsTokensToCreator() public {
        uint256 balBefore = creator.balance;
        (LaunchToken token,) = _launch(creator, 0.05 ether);
        uint256 got = token.balanceOf(creator);
        assertGt(got, 0);
        assertLe(got, SUPPLY * 500 / 10_000);
        assertEq(balBefore - creator.balance, 0.05 ether);
        // 1% fee on the dev buy accrued to the hook
        assertEq(_hookClaims(), 0.05 ether / 100);
    }

    function test_launch_devBuy_tooLarge_reverts() public {
        vm.prank(creator);
        vm.expectRevert(LaunchFactory.DevBuyTooLarge.selector);
        factory.launch{value: 1 ether}(LaunchFactory.LaunchParams("Big", "BIG", "", 0));
    }

    function test_launch_devBuy_slippage_reverts() public {
        vm.prank(creator);
        vm.expectRevert(LaunchFactory.DevBuySlippage.selector);
        factory.launch{value: 0.01 ether}(LaunchFactory.LaunchParams("A", "A", "", SUPPLY));
    }

    function test_launch_creationFee_goesToTreasury() public {
        LaunchFactory.LaunchConfig memory c = defaultConfig();
        c.creationFee = 0.002 ether;
        vm.prank(owner);
        factory.setConfig(c);

        vm.prank(creator);
        vm.expectRevert(LaunchFactory.InsufficientCreationFee.selector);
        factory.launch{value: 0.001 ether}(LaunchFactory.LaunchParams("A", "A", "", 0));

        (LaunchToken token,) = _launch(creator, 0.002 ether);
        assertEq(treasury.balance, 0.002 ether);
        assertEq(token.balanceOf(creator), 0, "no dev buy when only the fee is paid");
    }

    function test_launch_validatesStrings() public {
        vm.startPrank(creator);
        vm.expectRevert(LaunchFactory.InvalidName.selector);
        factory.launch(LaunchFactory.LaunchParams("", "A", "", 0));
        vm.expectRevert(LaunchFactory.InvalidName.selector);
        factory.launch(LaunchFactory.LaunchParams("123456789012345678901234567890123", "A", "", 0));
        vm.expectRevert(LaunchFactory.InvalidSymbol.selector);
        factory.launch(LaunchFactory.LaunchParams("A", "", "", 0));
        vm.expectRevert(LaunchFactory.InvalidSymbol.selector);
        factory.launch(LaunchFactory.LaunchParams("A", "1234567890123", "", 0));
        vm.stopPrank();
    }

    function test_launch_multipleTokensGetDistinctPools() public {
        (LaunchToken a, PoolKey memory ka) = _launch(creator, 0);
        (LaunchToken b, PoolKey memory kb) = _launch(alice, 0);
        assertTrue(address(a) != address(b));
        assertTrue(PoolId.unwrap(ka.toId()) != PoolId.unwrap(kb.toId()));
        assertEq(factory.launchCount(), 2);
    }

    function test_pause_blocksNewLaunchesOnly() public {
        (, PoolKey memory key) = _launch(creator, 0);
        vm.prank(owner);
        factory.setLaunchesPaused(true);

        vm.prank(creator);
        vm.expectRevert(LaunchFactory.LaunchesArePaused.selector);
        factory.launch(LaunchFactory.LaunchParams("A", "A", "", 0));

        // Existing pools keep trading.
        vm.warp(block.timestamp + 61);
        assertGt(_buy(alice, key, 0.1 ether), 0);
    }

    function test_onlyFactoryCanCreateHookedPools() public {
        LaunchToken fake = new LaunchToken("Fake", "FAKE", "", address(this));
        PoolKey memory key = factory.poolKeyFor(address(fake));
        vm.expectRevert();
        manager.initialize(key, TickMath.getSqrtPriceAtTick(0));

        vm.expectRevert(FeeHook.OnlyFactory.selector);
        hook.registerPool(key, address(this), 100, 5000, 0, 0);
    }

    function test_setFactory_onlyOnce() public {
        vm.prank(owner);
        vm.expectRevert(FeeHook.FactoryAlreadySet.selector);
        hook.setFactory(address(1));

        vm.expectRevert(FeeHook.OnlyAdmin.selector);
        hook.setFactory(address(1));
    }

    function test_setConfig_boundsAndOwnership() public {
        LaunchFactory.LaunchConfig memory c = defaultConfig();

        vm.expectRevert(Ownable.Unauthorized.selector);
        factory.setConfig(c);

        vm.startPrank(owner);
        c.feeBps = 201;
        vm.expectRevert(LaunchFactory.InvalidConfig.selector);
        factory.setConfig(c);

        c = defaultConfig();
        c.creatorShareBps = 10_001;
        vm.expectRevert(LaunchFactory.InvalidConfig.selector);
        factory.setConfig(c);

        c = defaultConfig();
        c.maxDevBuyBps = 1001;
        vm.expectRevert(LaunchFactory.InvalidConfig.selector);
        factory.setConfig(c);

        c = defaultConfig();
        c.creationFee = 0.06 ether;
        vm.expectRevert(LaunchFactory.InvalidConfig.selector);
        factory.setConfig(c);

        c = defaultConfig();
        c.antiSnipeDuration = 11 minutes;
        vm.expectRevert(LaunchFactory.InvalidConfig.selector);
        factory.setConfig(c);

        c = defaultConfig();
        c.startingMarketCap = 0;
        vm.expectRevert(LaunchFactory.InvalidConfig.selector);
        factory.setConfig(c);

        c = defaultConfig();
        c.feeBps = 200;
        factory.setConfig(c);
        vm.stopPrank();
    }

    function test_configChange_doesNotAffectExistingPools() public {
        (, PoolKey memory key) = _launchAndOpen();
        LaunchFactory.LaunchConfig memory c = defaultConfig();
        c.feeBps = 200;
        c.creatorShareBps = 0;
        vm.prank(owner);
        factory.setConfig(c);

        (, uint16 feeBps, uint16 share,,,) = hook.poolConfig(key.toId());
        assertEq(feeBps, 100);
        assertEq(share, 5000);

        uint256 before = _hookClaims();
        _buy(alice, key, 1 ether);
        assertEq(_hookClaims() - before, 0.01 ether, "old pool still charges 1%");
    }

    function test_setTreasury() public {
        vm.expectRevert(Ownable.Unauthorized.selector);
        factory.setTreasury(alice);
        vm.prank(owner);
        factory.setTreasury(alice);
        assertEq(factory.treasury(), alice);
    }
}
