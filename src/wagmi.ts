import { createConfig, webSocket } from "wagmi";
import { mainnet } from "wagmi/chains";
import { z } from "zod";

const envSchema = z.object({
  VITE_MAINNET_WS_RPC_URL: z.url(),
});

const env = envSchema.parse(import.meta.env);

export const config = createConfig({
  chains: [mainnet],
  transports: {
    [mainnet.id]: webSocket(env.VITE_MAINNET_WS_RPC_URL),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
