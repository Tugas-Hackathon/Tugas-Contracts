export const NETWORK = import.meta.env.VITE_NETWORK === "mainnet"
  ? {
      id: 677,
      name: "BOT Chain",
      rpc: "https://rpc.botchain.ai",
      explorer: "https://scan.botchain.ai",
      symbol: "BOT",
    }
  : {
      id: 968,
      name: "BOT Chain Testnet",
      rpc: "https://rpc.bohr.life",
      explorer: "https://scan.bohr.life",
      symbol: "tBOT",
    }
