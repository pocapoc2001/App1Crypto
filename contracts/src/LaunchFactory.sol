// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {Ownable} from "solady/auth/Ownable.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

import {FeeHook} from "./FeeHook.sol";
import {LaunchToken} from "./LaunchToken.sol";
import {LaunchMath} from "./libraries/LaunchMath.sol";

/// @title LaunchFactory
/// @notice One-click token launches straight into a Uniswap v4 pool (native ETH / token).
/// The whole supply is deposited as a single-sided liquidity position owned by this contract.
/// This contract has NO function that removes liquidity, so launch liquidity is locked forever.
/// The owner can only tune parameters for FUTURE launches (within hard caps), change the treasury and
/// pause new launches. It can never touch existing pools, balances, fees of existing pools or trading.
contract LaunchFactory is Ownable, IUnlockCallback {
    using SafeTransferLib for address;

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    int24 public constant TICK_SPACING = 200;
    uint256 internal constant BPS = 10_000;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 public constant MAX_CREATION_FEE = 0.05 ether;
    uint32 public constant MAX_ANTI_SNIPE_DURATION = 10 minutes;
    uint16 public constant MAX_DEV_BUY_BPS = 1000; // creator can never buy more than 10% at launch

    struct LaunchConfig {
        uint16 feeBps; // swap fee, in ETH (<= FeeHook.MAX_FEE_BPS)
        uint16 creatorShareBps; // share of the fee paid to the creator
        uint16 maxDevBuyBps; // max % of supply the creator may buy in the launch tx
        uint16 antiSnipeMaxBuyBps; // max % of supply one wallet may buy during the anti-snipe window
        uint32 antiSnipeDuration; // seconds
        uint96 creationFee; // flat ETH fee per launch, sent to treasury
        uint128 startingMarketCap; // fully-diluted market cap at launch, in wei of ETH
    }

    struct LaunchParams {
        string name;
        string symbol;
        string metadataURI;
        uint256 minDevBuyTokens; // slippage protection for the optional creator buy
    }

    struct TokenInfo {
        address creator;
        PoolId poolId;
        uint40 launchedAt;
    }

    IPoolManager public immutable poolManager;
    FeeHook public immutable hook;

    address public treasury;
    LaunchConfig public config;
    bool public launchesPaused;
    uint256 public launchCount;
    mapping(address token => TokenInfo) public tokenInfo;

    enum Action {
        AddLiquidity,
        DevBuy
    }

    event TokenLaunched(
        address indexed token,
        PoolId indexed poolId,
        address indexed creator,
        string name,
        string symbol,
        string metadataURI,
        int24 startTick,
        uint160 sqrtPriceX96,
        uint256 devBuyEth,
        uint16 feeBps,
        uint16 creatorShareBps
    );
    event DevBuy(address indexed token, address indexed creator, uint256 ethIn, uint256 tokensOut);
    event ConfigUpdated(LaunchConfig config);
    event TreasuryUpdated(address indexed treasury);
    event LaunchesPaused(bool paused);

    error LaunchesArePaused();
    error InvalidName();
    error InvalidSymbol();
    error InvalidMetadata();
    error InsufficientCreationFee();
    error DevBuyTooLarge();
    error DevBuySlippage();
    error InvalidConfig();
    error ZeroAddress();
    error NotPoolManager();

    constructor(
        IPoolManager _poolManager,
        FeeHook _hook,
        address _owner,
        address _treasury,
        LaunchConfig memory _config
    ) {
        if (_owner == address(0) || _treasury == address(0)) revert ZeroAddress();
        poolManager = _poolManager;
        hook = _hook;
        treasury = _treasury;
        _initializeOwner(_owner);
        _setConfig(_config);
    }

    // ---------------------------------------------------------------------------------------------
    // Launch
    // ---------------------------------------------------------------------------------------------

    /// @notice Create a token + pool. Any ETH sent above `config.creationFee` is used for an optional
    /// creator buy (capped at `config.maxDevBuyBps` of supply).
    function launch(LaunchParams calldata p) external payable returns (address token, PoolId poolId) {
        if (launchesPaused) revert LaunchesArePaused();
        _validateStrings(p);
        LaunchConfig memory cfg = config;
        if (msg.value < cfg.creationFee) revert InsufficientCreationFee();
        uint256 devBuyEth = msg.value - cfg.creationFee;

        token = address(new LaunchToken(p.name, p.symbol, p.metadataURI, address(this)));
        PoolKey memory key = poolKeyFor(token);
        poolId = key.toId();

        int24 startTick = LaunchMath.startTickForMarketCap(cfg.startingMarketCap, TOTAL_SUPPLY, TICK_SPACING);
        uint160 sqrtPriceX96 = TickMath.getSqrtPriceAtTick(startTick);

        hook.registerPool(
            key,
            msg.sender,
            cfg.feeBps,
            cfg.creatorShareBps,
            cfg.antiSnipeDuration,
            uint128(TOTAL_SUPPLY * cfg.antiSnipeMaxBuyBps / BPS)
        );
        poolManager.initialize(key, sqrtPriceX96);
        poolManager.unlock(abi.encode(Action.AddLiquidity, abi.encode(key, startTick)));

        tokenInfo[token] = TokenInfo({creator: msg.sender, poolId: poolId, launchedAt: uint40(block.timestamp)});
        unchecked {
            ++launchCount;
        }
        emit TokenLaunched(
            token,
            poolId,
            msg.sender,
            p.name,
            p.symbol,
            p.metadataURI,
            startTick,
            sqrtPriceX96,
            devBuyEth,
            cfg.feeBps,
            cfg.creatorShareBps
        );

        if (devBuyEth > 0) {
            uint256 maxTokens = TOTAL_SUPPLY * cfg.maxDevBuyBps / BPS;
            bytes memory res = poolManager.unlock(abi.encode(Action.DevBuy, abi.encode(key, devBuyEth, msg.sender)));
            (uint256 ethPaid, uint256 tokensOut) = abi.decode(res, (uint256, uint256));
            if (tokensOut > maxTokens) revert DevBuyTooLarge();
            if (tokensOut < p.minDevBuyTokens) revert DevBuySlippage();
            emit DevBuy(token, msg.sender, ethPaid, tokensOut);
            if (ethPaid < devBuyEth) msg.sender.safeTransferETH(devBuyEth - ethPaid);
        }

        if (cfg.creationFee > 0) treasury.safeTransferETH(cfg.creationFee);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (Action action, bytes memory inner) = abi.decode(data, (Action, bytes));

        if (action == Action.AddLiquidity) {
            (PoolKey memory key, int24 startTick) = abi.decode(inner, (PoolKey, int24));
            int24 lowerTick = TickMath.minUsableTick(TICK_SPACING);
            uint128 liquidity = LiquidityAmounts.getLiquidityForAmount1(
                TickMath.getSqrtPriceAtTick(lowerTick), TickMath.getSqrtPriceAtTick(startTick), TOTAL_SUPPLY
            );
            (BalanceDelta delta,) = poolManager.modifyLiquidity(
                key,
                ModifyLiquidityParams({
                    tickLower: lowerTick,
                    tickUpper: startTick,
                    liquidityDelta: int256(uint256(liquidity)),
                    salt: bytes32(0)
                }),
                ""
            );
            // Position is entirely above the current price range -> only the token side is owed.
            uint256 owed = uint256(uint128(-delta.amount1()));
            address token = Currency.unwrap(key.currency1);
            poolManager.sync(key.currency1);
            token.safeTransfer(address(poolManager), owed);
            poolManager.settle();
            // Rounding dust (a few wei) can never be sold by anyone: burn it.
            uint256 dust = TOTAL_SUPPLY - owed;
            if (dust > 0) token.safeTransfer(DEAD, dust);
            return "";
        }

        (PoolKey memory k, uint256 ethIn, address recipient) = abi.decode(inner, (PoolKey, uint256, address));
        BalanceDelta d = poolManager.swap(
            k,
            SwapParams({
                zeroForOne: true, amountSpecified: -int256(ethIn), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            ""
        );
        uint256 ethPaid = uint256(uint128(-d.amount0()));
        uint256 tokensOut = uint256(uint128(d.amount1()));
        poolManager.settle{value: ethPaid}();
        poolManager.take(k.currency1, recipient, tokensOut);
        return abi.encode(ethPaid, tokensOut);
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    function poolKeyFor(address token) public view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(token),
            fee: 0,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });
    }

    function getConfig() external view returns (LaunchConfig memory) {
        return config;
    }

    // ---------------------------------------------------------------------------------------------
    // Admin (future launches only)
    // ---------------------------------------------------------------------------------------------

    function setConfig(LaunchConfig calldata _config) external onlyOwner {
        _setConfig(_config);
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setLaunchesPaused(bool paused) external onlyOwner {
        launchesPaused = paused;
        emit LaunchesPaused(paused);
    }

    function _setConfig(LaunchConfig memory c) internal {
        if (
            c.feeBps > hook.MAX_FEE_BPS() || c.creatorShareBps > BPS || c.maxDevBuyBps > MAX_DEV_BUY_BPS
                || c.antiSnipeMaxBuyBps == 0 || c.antiSnipeMaxBuyBps > BPS
                || c.antiSnipeDuration > MAX_ANTI_SNIPE_DURATION || c.creationFee > MAX_CREATION_FEE
                || c.startingMarketCap < LaunchMath.MIN_MARKET_CAP || c.startingMarketCap > LaunchMath.MAX_MARKET_CAP
        ) revert InvalidConfig();
        config = c;
        emit ConfigUpdated(c);
    }

    function _validateStrings(LaunchParams calldata p) internal pure {
        uint256 n = bytes(p.name).length;
        if (n == 0 || n > 32) revert InvalidName();
        uint256 s = bytes(p.symbol).length;
        if (s == 0 || s > 12) revert InvalidSymbol();
        if (bytes(p.metadataURI).length > 512) revert InvalidMetadata();
    }
}
