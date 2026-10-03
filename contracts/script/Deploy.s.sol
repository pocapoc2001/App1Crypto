// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/test/shared/HookMiner.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {DeployPermit2} from "permit2/test/utils/DeployPermit2.sol";

import {FeeHook} from "../src/FeeHook.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";
import {LaunchRouter} from "../src/LaunchRouter.sol";

/// Deploys the launchpad on the current chain.
///
///   forge script script/Deploy.s.sol --rpc-url <alias|url> --broadcast [--private-key ... | --account ...]
///
/// Env (all optional): OWNER (factory owner, default deployer), TREASURY (default deployer).
/// Chain parameters come from script/chains.json. A zero poolManager means "deploy a fresh PoolManager"
/// (local anvil, Robinhood testnet). On local anvil, Permit2 is installed at its canonical address.
/// Writes deployments/<chainId>.json for the indexer and web app.
contract Deploy is Script {
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    struct Deployed {
        address poolManager;
        address hook;
        address router;
        address factory;
        uint256 startBlock;
    }

    function run() external returns (Deployed memory d) {
        string memory key = string.concat(".chain_", vm.toString(block.chainid));
        string memory json = vm.readFile("script/chains.json");
        require(vm.keyExistsJson(json, key), "chain not configured in script/chains.json");

        address deployer = msg.sender;
        address owner = vm.envOr("OWNER", deployer);
        address treasury = vm.envOr("TREASURY", deployer);
        address poolManager = vm.parseJsonAddress(json, string.concat(key, ".poolManager"));
        uint256 startingMarketCap = vm.parseJsonUint(json, string.concat(key, ".startingMarketCap"));
        uint256 creationFee = vm.parseJsonUint(json, string.concat(key, ".creationFee"));

        require(CREATE2_DEPLOYER.code.length > 0, "CREATE2 deployer proxy missing on this chain");
        if (PERMIT2.code.length == 0) _installPermit2Locally();

        d.startBlock = vm.getBlockNumber();
        vm.startBroadcast();

        if (poolManager == address(0)) {
            poolManager = address(new PoolManager(owner));
            console2.log("Deployed fresh PoolManager");
        }
        d.poolManager = poolManager;

        // Hook address must encode its permissions in the low 14 bits -> mine a CREATE2 salt.
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
                | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        bytes memory args = abi.encode(IPoolManager(poolManager), deployer);
        (address predicted, bytes32 salt) = HookMiner.find(CREATE2_DEPLOYER, flags, type(FeeHook).creationCode, args);
        FeeHook hook = new FeeHook{salt: salt}(IPoolManager(poolManager), deployer);
        require(address(hook) == predicted, "hook address mismatch");
        d.hook = address(hook);

        d.router = address(new LaunchRouter(IPoolManager(poolManager), ISignatureTransfer(PERMIT2)));

        LaunchFactory factory = new LaunchFactory(
            IPoolManager(poolManager),
            hook,
            owner,
            treasury,
            LaunchFactory.LaunchConfig({
                feeBps: 100, // 1% per swap, in ETH
                creatorShareBps: 5000, // 50% to the creator
                referralShareBps: 2000, // 20% of the platform's half to the trader's referrer, if any
                maxDevBuyBps: 500, // creator can buy at most 5% at launch
                antiSnipeMaxBuyBps: 100, // max 1% per wallet...
                antiSnipeDuration: 60, // ...during the first 60 seconds
                creationFee: uint96(creationFee),
                startingMarketCap: uint128(startingMarketCap)
            })
        );
        d.factory = address(factory);
        hook.setFactory(address(factory));

        vm.stopBroadcast();

        _write(d, vm.parseJsonString(json, string.concat(key, ".name")));
        console2.log("PoolManager ", d.poolManager);
        console2.log("FeeHook     ", d.hook);
        console2.log("LaunchRouter", d.router);
        console2.log("Factory     ", d.factory);
    }

    /// Local anvil has no Permit2: copy the canonical runtime bytecode to the canonical address.
    function _installPermit2Locally() internal {
        require(block.chainid == 1337, "Permit2 missing on this chain");
        new DeployPermit2().deployPermit2(); // etches into the local simulation
        vm.rpc("anvil_setCode", string.concat('["', vm.toString(PERMIT2), '","', vm.toString(PERMIT2.code), '"]'));
        console2.log("Installed Permit2 on local anvil");
    }

    function _write(Deployed memory d, string memory name) internal {
        string memory o = "deployment";
        vm.serializeString(o, "name", name);
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "poolManager", d.poolManager);
        vm.serializeAddress(o, "permit2", PERMIT2);
        vm.serializeAddress(o, "hook", d.hook);
        vm.serializeAddress(o, "router", d.router);
        vm.serializeUint(o, "startBlock", d.startBlock);
        string memory out = vm.serializeAddress(o, "factory", d.factory);
        vm.writeJson(out, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
