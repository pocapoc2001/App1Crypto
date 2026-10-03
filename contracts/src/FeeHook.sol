// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary,
    toBeforeSwapDelta
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {BaseHook} from "./base/BaseHook.sol";

interface ITreasurySource {
    function treasury() external view returns (address);
}

/// @title FeeHook
/// @notice Uniswap v4 hook for launchpad pools (native ETH / token).
///  - Takes a per-pool fee (snapshotted at launch, capped at MAX_FEE_BPS) on every swap, always in ETH.
///  - Splits the fee between the token's creator (fee recipient) and the protocol treasury.
///  - Referrals: part of the protocol cut (per-pool snapshot, capped at MAX_REFERRAL_SHARE_BPS) goes to the
///    trader's referrer. The first valid referrer a trader (tx.origin) passes in hookData sticks for good.
///  - Fees are held as ERC-6909 claims on the PoolManager and paid out in ETH on claim.
///  - Only the factory can create pools that use this hook.
///  - Light anti-snipe: no third-party swaps in the launch second, then a per-tx.origin buy cap for a
///    short window.
/// The hook is not upgradeable and has no admin powers over fees of existing pools.
contract FeeHook is BaseHook, IUnlockCallback {
    using SafeCast for uint256;
    using StateLibrary for IPoolManager;
    using CurrencyLibrary for Currency;

    uint256 public constant MAX_FEE_BPS = 200; // 2% hard cap, enforced for every pool
    uint256 public constant MAX_REFERRAL_SHARE_BPS = 5000; // referrers never get more than half the protocol cut
    uint256 internal constant BPS = 10_000;
    Currency internal constant ETH = Currency.wrap(address(0));
    uint256 internal constant ETH_ID = 0; // ERC-6909 id of native ETH

    struct PoolConfig {
        address feeRecipient; // receives the creator share; transferable by the current recipient
        uint16 feeBps;
        uint16 creatorShareBps;
        uint16 referralShareBps; // share of the protocol cut paid to the trader's referrer
        uint40 launchedAt;
        uint32 antiSnipeDuration;
        uint128 antiSnipeMaxBuy; // max tokens one tx.origin may buy during the anti-snipe window
    }

    address public immutable admin; // may only call setFactory, once
    address public factory;

    mapping(PoolId => PoolConfig) public poolConfig;
    mapping(PoolId => mapping(address => uint256)) public antiSnipeBought;
    mapping(address => uint256) public claimable; // creator and referral fees, pooled per address
    uint256 public protocolFeesAccrued;
    /// @notice First valid referrer each trader (tx.origin) traded with. Set once, never changes.
    mapping(address trader => address referrer) public referrerOf;

    event FactorySet(address indexed factory);
    event PoolRegistered(
        PoolId indexed poolId,
        address indexed feeRecipient,
        uint16 feeBps,
        uint16 creatorShareBps,
        uint16 referralShareBps
    );
    event Trade(
        PoolId indexed poolId,
        address indexed trader,
        bool isBuy,
        uint256 ethAmount,
        uint256 tokenAmount,
        uint256 feeEth,
        uint160 sqrtPriceX96,
        int24 tick
    );
    event FeesClaimed(address indexed recipient, uint256 amount);
    event ProtocolFeesClaimed(address indexed treasury, uint256 amount);
    event FeeRecipientTransferred(PoolId indexed poolId, address indexed from, address indexed to);
    event ReferrerSet(address indexed trader, address indexed referrer);
    event ReferralFeeAccrued(PoolId indexed poolId, address indexed referrer, address indexed trader, uint256 amount);

    error OnlyAdmin();
    error OnlyFactory();
    error FactoryAlreadySet();
    error InvalidPoolKey();
    error PoolAlreadyRegistered();
    error PoolNotRegistered();
    error FeeTooHigh();
    error InvalidShare();
    error LaunchLocked();
    error AntiSnipeLimit();
    error NotFeeRecipient();
    error ZeroAddress();
    error NothingToClaim();

    constructor(IPoolManager _poolManager, address _admin) BaseHook(_poolManager) {
        if (_admin == address(0)) revert ZeroAddress();
        admin = _admin;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ---------------------------------------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------------------------------------

    function setFactory(address _factory) external {
        if (msg.sender != admin) revert OnlyAdmin();
        if (factory != address(0)) revert FactoryAlreadySet();
        if (_factory == address(0)) revert ZeroAddress();
        factory = _factory;
        emit FactorySet(_factory);
    }

    /// @notice Called by the factory right before it initializes the pool.
    function registerPool(
        PoolKey calldata key,
        address feeRecipient,
        uint16 feeBps,
        uint16 creatorShareBps,
        uint16 referralShareBps,
        uint32 antiSnipeDuration,
        uint128 antiSnipeMaxBuy
    ) external onlyFactory {
        if (!key.currency0.isAddressZero() || address(key.hooks) != address(this) || key.fee != 0) {
            revert InvalidPoolKey();
        }
        if (feeRecipient == address(0)) revert ZeroAddress();
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        if (creatorShareBps > BPS || referralShareBps > MAX_REFERRAL_SHARE_BPS) revert InvalidShare();
        PoolId id = key.toId();
        if (poolConfig[id].launchedAt != 0) revert PoolAlreadyRegistered();
        poolConfig[id] = PoolConfig({
            feeRecipient: feeRecipient,
            feeBps: feeBps,
            creatorShareBps: creatorShareBps,
            referralShareBps: referralShareBps,
            launchedAt: uint40(block.timestamp),
            antiSnipeDuration: antiSnipeDuration,
            antiSnipeMaxBuy: antiSnipeMaxBuy
        });
        emit PoolRegistered(id, feeRecipient, feeBps, creatorShareBps, referralShareBps);
    }

    // ---------------------------------------------------------------------------------------------
    // Hook callbacks
    // ---------------------------------------------------------------------------------------------

    function _beforeInitialize(address sender, PoolKey calldata key, uint160) internal view override returns (bytes4) {
        if (sender != factory) revert OnlyFactory();
        if (poolConfig[key.toId()].launchedAt == 0) revert PoolNotRegistered();
        return this.beforeInitialize.selector;
    }

    /// @dev When ETH is the *specified* side (exact-in buy, exact-out sell) the fee is taken here,
    /// from the specified amount, by returning a positive specified delta.
    /// The trader's referrer is resolved (and bound, on their first referred trade) here, on every swap.
    function _beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId id = key.toId();
        PoolConfig storage cfg = poolConfig[id];
        if (sender != factory && block.timestamp == cfg.launchedAt) revert LaunchLocked();

        address referrer = _referrerFor(hookData);
        uint256 fee = _specifiedSideFee(params, cfg.feeBps);
        if (fee == 0) return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        _accrue(id, cfg, fee, referrer);
        return (this.beforeSwap.selector, toBeforeSwapDelta(fee.toInt128(), 0), 0);
    }

    /// @dev When ETH is the *unspecified* side (exact-out buy, exact-in sell) the fee is taken here,
    /// from the ETH amount the pool actually moved, by returning a positive unspecified delta.
    function _afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        PoolId id = key.toId();
        PoolConfig storage cfg = poolConfig[id];

        uint256 ethMoved = _abs(delta.amount0());
        uint256 tokenMoved = _abs(delta.amount1());
        bool isBuy = params.zeroForOne;

        uint256 fee;
        int128 hookDelta;
        if (_ethIsSpecified(params)) {
            fee = _specifiedSideFee(params, cfg.feeBps); // already accrued in beforeSwap
        } else {
            fee = ethMoved * cfg.feeBps / BPS;
            if (fee > 0) {
                _accrue(id, cfg, fee, referrerOf[tx.origin]); // bound in beforeSwap if this trade set it
                hookDelta = fee.toInt128();
            }
        }

        if (isBuy && sender != factory && block.timestamp < uint256(cfg.launchedAt) + cfg.antiSnipeDuration) {
            uint256 bought = antiSnipeBought[id][tx.origin] + tokenMoved;
            if (bought > cfg.antiSnipeMaxBuy) revert AntiSnipeLimit();
            antiSnipeBought[id][tx.origin] = bought;
        }

        // What the trader actually paid (buy) or received (sell) in ETH, fee included.
        uint256 traderEth = isBuy ? ethMoved + fee : ethMoved - fee;
        (uint160 sqrtPriceX96, int24 tick,,) = poolManager.getSlot0(id);
        emit Trade(id, tx.origin, isBuy, traderEth, tokenMoved, fee, sqrtPriceX96, tick);

        return (this.afterSwap.selector, hookDelta);
    }

    // ---------------------------------------------------------------------------------------------
    // Fees
    // ---------------------------------------------------------------------------------------------

    /// @notice Pays out all ETH fees owed to `recipient` (creator and referral fees). Anyone can trigger it;
    /// funds only go to `recipient`.
    function claimFees(address recipient) external returns (uint256 amount) {
        amount = claimable[recipient];
        if (amount == 0) revert NothingToClaim();
        claimable[recipient] = 0;
        _payout(recipient, amount);
        emit FeesClaimed(recipient, amount);
    }

    /// @notice Sends the accumulated protocol share to the factory's current treasury.
    function claimProtocolFees() external returns (uint256 amount) {
        amount = protocolFeesAccrued;
        if (amount == 0) revert NothingToClaim();
        protocolFeesAccrued = 0;
        address treasury = ITreasurySource(factory).treasury();
        _payout(treasury, amount);
        emit ProtocolFeesClaimed(treasury, amount);
    }

    /// @notice Hand the creator fee stream of a pool to a new address (e.g. a community takeover wallet).
    /// Only affects fees accrued after the transfer.
    function transferFeeRecipient(PoolId id, address newRecipient) external {
        PoolConfig storage cfg = poolConfig[id];
        if (msg.sender != cfg.feeRecipient) revert NotFeeRecipient();
        if (newRecipient == address(0)) revert ZeroAddress();
        cfg.feeRecipient = newRecipient;
        emit FeeRecipientTransferred(id, msg.sender, newRecipient);
    }

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (address to, uint256 amount) = abi.decode(data, (address, uint256));
        poolManager.burn(address(this), ETH_ID, amount);
        poolManager.take(ETH, to, amount);
        return "";
    }

    // ---------------------------------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------------------------------

    /// @dev Books `fee` exactly once: the creator cut is the same with or without a referrer; the referrer
    /// (if any) gets `referralShareBps` of the protocol cut and the protocol keeps the rest.
    function _accrue(PoolId id, PoolConfig storage cfg, uint256 fee, address referrer) internal {
        poolManager.mint(address(this), ETH_ID, fee);
        uint256 creatorCut = fee * cfg.creatorShareBps / BPS;
        claimable[cfg.feeRecipient] += creatorCut;
        uint256 protocolCut = fee - creatorCut;
        if (referrer != address(0)) {
            uint256 referralCut = protocolCut * cfg.referralShareBps / BPS;
            if (referralCut > 0) {
                claimable[referrer] += referralCut;
                protocolCut -= referralCut;
                emit ReferralFeeAccrued(id, referrer, tx.origin, referralCut);
            }
        }
        protocolFeesAccrued += protocolCut;
    }

    /// @dev The trader's (tx.origin) referrer. Sticky: the first valid referrer a trader passes is stored and
    /// used for all their later trades, whatever hookData says then. hookData counts only when it is exactly one
    /// ABI-encoded address that is neither zero nor the trader; anything else is ignored, never reverted on,
    /// so third-party routers that pass their own hookData keep working.
    function _referrerFor(bytes calldata hookData) internal returns (address referrer) {
        referrer = referrerOf[tx.origin];
        if (referrer != address(0) || hookData.length != 32) return referrer;
        uint256 word = uint256(bytes32(hookData));
        // Dirty upper bits mean this is not an ABI-encoded address: ignore it rather than truncate it into one.
        if (word >> 160 != 0) return address(0);
        address candidate = address(uint160(word));
        if (candidate == address(0) || candidate == tx.origin) return address(0);
        referrerOf[tx.origin] = candidate;
        emit ReferrerSet(tx.origin, candidate);
        return candidate;
    }

    function _payout(address to, uint256 amount) internal {
        poolManager.unlock(abi.encode(to, amount));
    }

    /// @dev ETH (currency0) is the specified currency for exact-in buys and exact-out sells.
    function _ethIsSpecified(SwapParams calldata params) internal pure returns (bool) {
        return params.zeroForOne == (params.amountSpecified < 0);
    }

    function _specifiedSideFee(SwapParams calldata params, uint16 feeBps) internal pure returns (uint256) {
        if (!_ethIsSpecified(params)) return 0;
        int256 a = params.amountSpecified;
        uint256 amount = a < 0 ? uint256(-a) : uint256(a);
        return amount * feeBps / BPS;
    }

    function _abs(int128 x) internal pure returns (uint256) {
        return x < 0 ? uint256(uint128(-x)) : uint256(uint128(x));
    }
}
