// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "solady/tokens/ERC20.sol";

/// @title LaunchToken
/// @notice Plain fixed-supply ERC-20 created by LaunchFactory.
/// There is deliberately no owner, no mint, no burn-from, no transfer tax, no pause and no blacklist:
/// once deployed, nobody (including the platform) can change balances or trading rules.
/// Permit2 has an infinite allowance by default (Solady), so selling needs a signature, not an approve tx.
contract LaunchToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    string private _name;
    string private _symbol;

    /// @notice Off-chain JSON (image, description, socials). Set once at creation, immutable afterwards.
    string public metadataURI;

    constructor(string memory name_, string memory symbol_, string memory metadataURI_, address recipient) {
        _name = name_;
        _symbol = symbol_;
        metadataURI = metadataURI_;
        _mint(recipient, TOTAL_SUPPLY);
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }
}
