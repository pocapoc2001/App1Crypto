// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {DeployPermit2} from "permit2/test/utils/DeployPermit2.sol";

import {FeeHook} from "../../src/FeeHook.sol";
import {LaunchFactory} from "../../src/LaunchFactory.sol";
import {LaunchRouter} from "../../src/LaunchRouter.sol";
import {LaunchToken} from "../../src/LaunchToken.sol";

abstract contract LaunchFixture is Test {
    using StateLibrary for IPoolManager;

    uint160 internal constant HOOK_FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
            | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
    );
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    uint256 internal constant SUPPLY = 1_000_000_000 ether;
    uint256 internal constant START_TIME = 1_800_000_000;

    PoolManager internal manager;
    FeeHook internal hook;
    LaunchFactory internal factory;
    LaunchRouter internal router;
    PoolSwapTest internal swapper;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal alice;
    uint256 internal aliceKey;
    address internal bob = makeAddr("bob");

    function defaultConfig() internal pure returns (LaunchFactory.LaunchConfig memory) {
        return LaunchFactory.LaunchConfig({
            feeBps: 100,
            creatorShareBps: 5000,
            referralShareBps: 2000,
            maxDevBuyBps: 500,
            antiSnipeMaxBuyBps: 100,
            antiSnipeDuration: 60,
            creationFee: 0,
            startingMarketCap: 1.5 ether
        });
    }

    function setUp() public virtual {
        vm.warp(START_TIME);
        (alice, aliceKey) = makeAddrAndKey("alice");
        new DeployPermit2().deployPermit2();

        manager = new PoolManager(address(this));
        address hookAddr = address(HOOK_FLAGS | (uint160(0x4444) << 144));
        deployCodeTo("FeeHook.sol:FeeHook", abi.encode(manager, owner), hookAddr);
        hook = FeeHook(hookAddr);

        router = new LaunchRouter(manager, ISignatureTransfer(PERMIT2));
        factory = new LaunchFactory(manager, hook, owner, treasury, defaultConfig());
        vm.prank(owner);
        hook.setFactory(address(factory));

        swapper = new PoolSwapTest(manager);

        vm.deal(creator, 1_000 ether);
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
    }

    // ---------------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------------

    function _launch(address who, uint256 value) internal returns (LaunchToken token, PoolKey memory key) {
        vm.prank(who);
        (address t,) = factory.launch{value: value}(
            LaunchFactory.LaunchParams({
                name: "Test Coin", symbol: "TEST", metadataURI: "ipfs://meta", minDevBuyTokens: 0
            })
        );
        token = LaunchToken(t);
        key = factory.poolKeyFor(t);
    }

    /// Launch and move past the launch second + anti-snipe window.
    function _launchAndOpen() internal returns (LaunchToken token, PoolKey memory key) {
        (token, key) = _launch(creator, 0);
        vm.warp(block.timestamp + 61);
    }

    function _hookClaims() internal view returns (uint256) {
        return manager.balanceOf(address(hook), 0);
    }

    function _marketCap(PoolKey memory key) internal view returns (uint256) {
        (uint160 sqrtPriceX96,,,) = IPoolManager(address(manager)).getSlot0(key.toId());
        // price = tokens per ETH = sqrtP^2 / 2^192 ; mcap = supply / price
        return FullMath.mulDiv(FullMath.mulDiv(SUPPLY, 1 << 96, sqrtPriceX96), 1 << 96, sqrtPriceX96);
    }

    function _swapRaw(address who, PoolKey memory key, bool zeroForOne, int256 amountSpecified, uint256 value)
        internal
        returns (BalanceDelta delta)
    {
        return _swapRaw(who, key, zeroForOne, amountSpecified, value, "");
    }

    /// Swap through PoolSwapTest (any of the four exact-in/exact-out shapes) with arbitrary hookData.
    function _swapRaw(
        address who,
        PoolKey memory key,
        bool zeroForOne,
        int256 amountSpecified,
        uint256 value,
        bytes memory hookData
    ) internal returns (BalanceDelta delta) {
        vm.prank(who, who);
        delta = swapper.swap{value: value}(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: amountSpecified,
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            hookData
        );
    }

    function _buy(address who, PoolKey memory key, uint256 ethIn) internal returns (uint256 tokensOut) {
        return _buy(who, key, ethIn, address(0));
    }

    function _buy(address who, PoolKey memory key, uint256 ethIn, address referrer)
        internal
        returns (uint256 tokensOut)
    {
        vm.prank(who, who);
        tokensOut = router.buy{value: ethIn}(key, 0, who, block.timestamp, referrer);
    }

    function _signPermit(uint256 pk, address token, uint256 amount, uint256 nonce, uint256 deadline, address spender)
        internal
        view
        returns (bytes memory)
    {
        bytes32 tokenPermissions =
            keccak256(abi.encode(keccak256("TokenPermissions(address token,uint256 amount)"), token, amount));
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
                ),
                tokenPermissions,
                spender,
                nonce,
                deadline
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", ISignatureTransfer(PERMIT2).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
}
