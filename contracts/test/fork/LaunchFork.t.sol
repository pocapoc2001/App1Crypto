// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";

import {FeeHook} from "../../src/FeeHook.sol";
import {LaunchFactory} from "../../src/LaunchFactory.sol";
import {LaunchRouter} from "../../src/LaunchRouter.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";

/// Runs the full launch -> buy -> sell -> claim flow against the REAL Uniswap v4 PoolManager and Permit2
/// of a live chain. Opt-in (needs network):
///   RUN_FORK_TESTS=true forge test --match-path "test/fork/*" -vv
abstract contract LaunchForkBase is Test {
    uint160 internal constant HOOK_FLAGS = (1 << 13) | (1 << 7) | (1 << 6) | (1 << 3) | (1 << 2);
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    function rpcAlias() internal pure virtual returns (string memory);
    function poolManagerAddr() internal pure virtual returns (address);

    function test_fork_fullFlow() public {
        if (!vm.envOr("RUN_FORK_TESTS", false)) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpcAlias());
        IPoolManager manager = IPoolManager(poolManagerAddr());
        assertGt(address(manager).code.length, 0, "PoolManager missing on this chain");
        assertGt(PERMIT2.code.length, 0, "Permit2 missing on this chain");

        address owner = makeAddr("owner");
        address treasury = makeAddr("treasury");
        address creator = makeAddr("creator");
        address trader = makeAddr("trader");
        address referrer = makeAddr("referrer");
        vm.deal(creator, 10 ether);
        vm.deal(trader, 10 ether);

        address hookAddr = address(HOOK_FLAGS | (uint160(0x5151) << 144));
        deployCodeTo("FeeHook.sol:FeeHook", abi.encode(manager, owner), hookAddr);
        FeeHook hook = FeeHook(hookAddr);
        LaunchRouter router = new LaunchRouter(manager, ISignatureTransfer(PERMIT2));
        LaunchFactory factory = new LaunchFactory(
            manager,
            hook,
            owner,
            treasury,
            LaunchFactory.LaunchConfig({
                feeBps: 100,
                creatorShareBps: 5000,
                referralShareBps: 2000,
                maxDevBuyBps: 500,
                antiSnipeMaxBuyBps: 100,
                antiSnipeDuration: 60,
                creationFee: 0,
                startingMarketCap: 1.5 ether
            })
        );
        vm.prank(owner);
        hook.setFactory(address(factory));

        vm.prank(creator, creator);
        (address t,) = factory.launch{value: 0.01 ether}(LaunchFactory.LaunchParams("Fork Coin", "FORK", "", 0));
        PoolKey memory key = factory.poolKeyFor(t);
        vm.warp(block.timestamp + 61);

        vm.prank(trader, trader);
        uint256 tokens = router.buy{value: 1 ether}(key, 0, trader, block.timestamp, referrer);
        assertGt(tokens, 0);
        assertEq(hook.referrerOf(trader), referrer);

        vm.startPrank(trader, trader);
        LaunchToken(t).approve(address(router), tokens);
        uint256 ethOut = router.sell(key, tokens, 0, trader, block.timestamp, address(0));
        vm.stopPrank();
        assertGt(ethOut, 0.9 ether);

        uint256 owed = hook.claimable(creator);
        uint256 before = creator.balance;
        hook.claimFees(creator);
        assertEq(creator.balance - before, owed);

        // The referrer earned 20% of the platform's half on both trades (sticky on the sell) and claims it in ETH.
        uint256 referralOwed = hook.claimable(referrer);
        assertGt(referralOwed, 0.0019 ether);
        before = referrer.balance;
        hook.claimFees(referrer);
        assertEq(referrer.balance - before, referralOwed);
        hook.claimProtocolFees();
        assertGt(treasury.balance, 0);
    }
}

contract BaseSepoliaForkTest is LaunchForkBase {
    function rpcAlias() internal pure override returns (string memory) {
        return "base_sepolia";
    }

    function poolManagerAddr() internal pure override returns (address) {
        return 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408;
    }
}

contract RobinhoodForkTest is LaunchForkBase {
    function rpcAlias() internal pure override returns (string memory) {
        return "robinhood";
    }

    function poolManagerAddr() internal pure override returns (address) {
        return 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    }
}
