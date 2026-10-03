// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {LaunchMath} from "../../src/libraries/LaunchMath.sol";

contract LaunchMathHarness {
    function startTick(uint256 mcap) external pure returns (int24) {
        return LaunchMath.startTickForMarketCap(mcap, 1_000_000_000 ether, 200);
    }
}

contract LaunchMathTest is Test {
    LaunchMathHarness internal h = new LaunchMathHarness();

    function _mcapAt(int24 tick) internal pure returns (uint256) {
        uint160 sp = TickMath.getSqrtPriceAtTick(tick);
        return FullMath.mulDiv(FullMath.mulDiv(1_000_000_000 ether, 1 << 96, sp), 1 << 96, sp);
    }

    function testFuzz_startTick_alignedAndClose(uint256 mcap) public view {
        mcap = bound(mcap, LaunchMath.MIN_MARKET_CAP, LaunchMath.MAX_MARKET_CAP);
        int24 tick = h.startTick(mcap);
        assertEq(tick % 200, 0, "aligned to spacing");
        assertGt(tick, TickMath.minUsableTick(200), "room for the liquidity range");
        uint256 actual = _mcapAt(tick);
        assertGe(actual * 1001 / 1000, mcap, "never meaningfully below target");
        assertLe(actual, mcap * 1021 / 1000, "at most one spacing (~2%) above target");
    }

    function test_floorToSpacing() public pure {
        assertEq(LaunchMath.floorToSpacing(399, 200), 200);
        assertEq(LaunchMath.floorToSpacing(400, 200), 400);
        assertEq(LaunchMath.floorToSpacing(-1, 200), -200);
        assertEq(LaunchMath.floorToSpacing(-200, 200), -200);
        assertEq(LaunchMath.floorToSpacing(-201, 200), -400);
    }

    function test_outOfRange_reverts() public {
        vm.expectRevert(LaunchMath.MarketCapOutOfRange.selector);
        h.startTick(0.0001 ether);
        vm.expectRevert(LaunchMath.MarketCapOutOfRange.selector);
        h.startTick(2_000_000 ether);
    }
}
