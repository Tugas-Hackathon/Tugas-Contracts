import "dotenv/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";
import networks from "./networks.json" with { type: "json" };

const explorer = (n: { name: string; explorer: string }) => ({
  name: n.name,
  blockExplorers: {
    blockscout: { name: "Blockscout", url: n.explorer, apiUrl: `${n.explorer}/api` },
  },
});

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    testnet: {
      type: "http",
      chainType: "l1",
      chainId: networks.testnet.chainId,
      url: networks.testnet.rpc,
      accounts: [configVariable("DEPLOYER_KEY")],
    },
    mainnet: {
      type: "http",
      chainType: "l1",
      chainId: networks.mainnet.chainId,
      url: networks.mainnet.rpc,
      accounts: [configVariable("DEPLOYER_KEY")],
    },
  },
  chainDescriptors: {
    [networks.testnet.chainId]: explorer(networks.testnet),
    [networks.mainnet.chainId]: explorer(networks.mainnet),
  },
  verify: {
    blockscout: { enabled: true },
    etherscan: { enabled: false },
  },
});
