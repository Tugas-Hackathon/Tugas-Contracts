import { createConfig, http } from "wagmi"
import { injected } from "wagmi/connectors"
import { defineChain } from "viem"
import { NETWORK } from "./networks"

export const botChain = defineChain({
  id: NETWORK.id,
  name: NETWORK.name,
  nativeCurrency: { name: NETWORK.symbol, symbol: NETWORK.symbol, decimals: 18 },
  rpcUrls: { default: { http: [NETWORK.rpc] } },
  blockExplorers: { default: { name: "Blockscout", url: NETWORK.explorer } },
})

export const wagmiConfig = createConfig({
  chains: [botChain],
  connectors: [injected()],
  transports: { [NETWORK.id]: http(NETWORK.rpc) },
})
