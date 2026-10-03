// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

/// @notice Helpers to turn a starting market cap (in ETH) into a Uniswap v4 tick.
/// Pools are always (currency0 = native ETH, currency1 = token), so price = tokens per ETH and a
/// higher token value means a LOWER tick.
library LaunchMath {
    error MarketCapOutOfRange();

    uint256 internal constant MIN_MARKET_CAP = 0.001 ether;
    uint256 internal constant MAX_MARKET_CAP = 1_000_000 ether;

    /// @return tick The highest tick that is a multiple of `tickSpacing` and whose price gives a
    /// fully-diluted market cap of at least `marketCapWei` for `supply` tokens.
    function startTickForMarketCap(uint256 marketCapWei, uint256 supply, int24 tickSpacing)
        internal
        pure
        returns (int24 tick)
    {
        if (marketCapWei < MIN_MARKET_CAP || marketCapWei > MAX_MARKET_CAP) revert MarketCapOutOfRange();
        // price (token1 per token0) = supply / marketCap ; sqrtPriceX96 = sqrt(price) * 2^96
        uint256 priceX192 = FullMath.mulDiv(supply, 1 << 192, marketCapWei);
        uint160 sqrtPriceX96 = uint160(FixedPointMathLib.sqrt(priceX192));
        int24 rawTick = TickMath.getTickAtSqrtPrice(sqrtPriceX96);
        tick = floorToSpacing(rawTick, tickSpacing);
    }

    function floorToSpacing(int24 tick, int24 tickSpacing) internal pure returns (int24) {
        int24 compressed = tick / tickSpacing;
        if (tick < 0 && tick % tickSpacing != 0) compressed--;
        return compressed * tickSpacing;
    }
}
