# ETH Logs Visualizer

Live Ethereum mainnet log stream built with Bun, Vite, React, wagmi, viem, and WhatsABI.

## Features

- Streams latest Ethereum blocks and ingests logs in real time
- Decodes logs via WhatsABI + viem event decoding
- Dedicated panels for:
  - Swaps (with in/out token details)
  - ERC20 transfers
  - NFT transfers (with metadata + image when available)
  - Other decoded events (expandable)
- Event leaderboard by occurrence count
- Etherscan links for contracts, tokens, wallets, and tx timestamps

## Requirements

- Bun
- A websocket Ethereum RPC endpoint

## Local setup

1. Install dependencies

```bash
bun install
```

2. Create `.env.local`

```bash
VITE_MAINNET_WS_RPC_URL=wss://eth-mainnet.g.alchemy.com/v2/<your-alchemy-key>
VITE_ETHERSCAN_API_KEY=<optional-etherscan-key>
```

3. Start dev server

```bash
bun run dev
```

4. Build production bundle

```bash
bun run build
```

## Notes

- `.env.local` is gitignored and should not be committed
- The app keeps a rolling in-memory log buffer (`MAX_LOGS`) and bounded decode window (`MAX_DECODE_ADDRESSES`)
