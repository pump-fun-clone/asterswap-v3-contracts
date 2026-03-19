// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma abicoder v2;

// Minimal Vm interface — avoids forge-std version conflict with 0.7.6 contracts
interface Vm {
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
    function envUint(string calldata name) external returns (uint256);
    function addr(uint256 privateKey) external pure returns (address);
}

import "@uniswap/v3-core/contracts/UniswapV3Factory.sol";
import "@uniswap/v3-periphery/contracts/SwapRouter.sol";
import "@uniswap/v3-periphery/contracts/NonfungibleTokenPositionDescriptor.sol";
import "@uniswap/v3-periphery/contracts/NonfungiblePositionManager.sol";
import "@uniswap/v3-periphery/contracts/lens/QuoterV2.sol";
import "@uniswap/v3-periphery/contracts/lens/TickLens.sol";

contract DeployV3 {
    Vm constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    // BSC Mainnet WBNB
    address constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // 1. Deploy Factory
        UniswapV3Factory factory = new UniswapV3Factory();

        // 2. Deploy SwapRouter
        SwapRouter router = new SwapRouter(address(factory), WBNB);

        // 3. Deploy NonfungibleTokenPositionDescriptor ("BNB" null-padded to bytes32)
        bytes32 nativeCurrencyLabel = bytes32("BNB");
        NonfungibleTokenPositionDescriptor descriptor =
            new NonfungibleTokenPositionDescriptor(WBNB, nativeCurrencyLabel);

        // 4. Deploy NonfungiblePositionManager
        NonfungiblePositionManager positionManager = new NonfungiblePositionManager(
            address(factory),
            WBNB,
            address(descriptor)
        );

        // 5. Deploy QuoterV2
        QuoterV2 quoterV2 = new QuoterV2(address(factory), WBNB);

        // 6. Deploy TickLens
        TickLens tickLens = new TickLens();

        vm.stopBroadcast();

        // Silence unused variable warnings
        router;
        descriptor;
        positionManager;
        quoterV2;
        tickLens;
    }
}
