import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── Config ───────────────────────────────────────────────────────────────────
const PRIVATE_KEY = '0xf81e55575af70d25965afeeb8f085f68e357c1692ab0ec776cc0d5650c47061d';
const WBNB        = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const BSC_RPC     = 'https://bsc-dataseed.binance.org/';
const GAS_PRICE   = ethers.parseUnits('3', 'gwei');

function artifact(path) {
  return JSON.parse(readFileSync(join(ROOT, 'node_modules', path), 'utf8'));
}

async function deploy(wallet, name, abi, bytecode, args = [], gasLimit) {
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(...args, { gasPrice: GAS_PRICE, gasLimit });
  console.log(`  tx: ${contract.deploymentTransaction().hash}`);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`  ${name}: ${addr}`);
  return addr;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(BSC_RPC);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('=== AsterSwap V3 Deployment ===');
  console.log('Deployer:', wallet.address);
  console.log('Balance:', ethers.formatEther(await provider.getBalance(wallet.address)), 'BNB');
  console.log('Chain ID:', (await provider.getNetwork()).chainId.toString());
  console.log('');

  // ─── 1. UniswapV3Factory ────────────────────────────────────────────────────
  console.log('[1/6] UniswapV3Factory...');
  const factoryArt = artifact('@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json');
  const factoryAddr = await deploy(wallet, 'UniswapV3Factory', factoryArt.abi, factoryArt.bytecode, [], 8_000_000);

  // ─── 2. SwapRouter ──────────────────────────────────────────────────────────
  console.log('\n[2/6] SwapRouter...');
  const routerArt = artifact('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json');
  const routerAddr = await deploy(wallet, 'SwapRouter', routerArt.abi, routerArt.bytecode, [factoryAddr, WBNB], 3_000_000);

  // ─── 3. NFTDescriptor library ───────────────────────────────────────────────
  // NFTDescriptor is a library — must be deployed first, then linked into the Descriptor contract
  console.log('\n[3/6] NFTDescriptor library...');
  const nftDescLibArt = artifact('@uniswap/v3-periphery/artifacts/contracts/libraries/NFTDescriptor.sol/NFTDescriptor.json');
  const nftDescLibAddr = await deploy(wallet, 'NFTDescriptor (lib)', nftDescLibArt.abi, nftDescLibArt.bytecode, [], 6_000_000);

  // ─── 4. NonfungibleTokenPositionDescriptor ──────────────────────────────────
  console.log('\n[4/6] NonfungibleTokenPositionDescriptor...');
  const posDescArt = artifact('@uniswap/v3-periphery/artifacts/contracts/NonfungibleTokenPositionDescriptor.sol/NonfungibleTokenPositionDescriptor.json');

  // Link NFTDescriptor library into NonfungibleTokenPositionDescriptor bytecode
  const nftDescLibRef = '__$cea9be979eee3d87fb124d6cbb244bb0b5$__';
  const linkedBytecode = posDescArt.bytecode.replaceAll(
    nftDescLibRef,
    nftDescLibAddr.slice(2).toLowerCase()
  );

  // "BNB" as null-padded bytes32 (right-padded with zeros in ABI encoding)
  const nativeCurrencyLabel = ethers.encodeBytes32String('BNB');
  const posDescAddr = await deploy(
    wallet, 'NonfungibleTokenPositionDescriptor',
    posDescArt.abi, linkedBytecode,
    [WBNB, nativeCurrencyLabel],
    2_000_000
  );

  // ─── 5. NonfungiblePositionManager ─────────────────────────────────────────
  console.log('\n[5/6] NonfungiblePositionManager...');
  const npmArt = artifact('@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json');
  const npmAddr = await deploy(
    wallet, 'NonfungiblePositionManager',
    npmArt.abi, npmArt.bytecode,
    [factoryAddr, WBNB, posDescAddr],
    6_500_000
  );

  // ─── 6. QuoterV2 ────────────────────────────────────────────────────────────
  console.log('\n[6/6] QuoterV2...');
  const quoterArt = artifact('@uniswap/v3-periphery/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json');
  const quoterAddr = await deploy(wallet, 'QuoterV2', quoterArt.abi, quoterArt.bytecode, [factoryAddr, WBNB], 2_500_000);

  // ─── Bonus: TickLens ────────────────────────────────────────────────────────
  console.log('\n[+] TickLens...');
  const tickLensArt = artifact('@uniswap/v3-periphery/artifacts/contracts/lens/TickLens.sol/TickLens.json');
  const tickLensAddr = await deploy(wallet, 'TickLens', tickLensArt.abi, tickLensArt.bytecode, [], 2_000_000);

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║           AsterSwap V3 — BSC Mainnet Deployment Complete            ║
╠══════════════════════════════════════════════════════════════════════╣
║  UniswapV3Factory:                ${factoryAddr}  ║
║  SwapRouter:                      ${routerAddr}  ║
║  NFTDescriptor (lib):             ${nftDescLibAddr}  ║
║  NonfungibleTokenPosDescriptor:   ${posDescAddr}  ║
║  NonfungiblePositionManager:      ${npmAddr}  ║
║  QuoterV2:                        ${quoterAddr}  ║
║  TickLens:                        ${tickLensAddr}  ║
║  WBNB:                            ${WBNB}  ║
╚══════════════════════════════════════════════════════════════════════╝
`);
}

main().catch((e) => { console.error(e); process.exit(1); });
