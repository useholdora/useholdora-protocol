# Holdora

**Patience, rewarded.** A Solana token for people who stay.

[![Live site](https://img.shields.io/badge/live-holdora.fun-0ecba1)](https://holdora.fun)
![Chain: Solana](https://img.shields.io/badge/chain-Solana-029978)

| | |
|---|---|
| Chain | Solana |
| Contract address | `pending` (not yet confirmed) |
| Site | https://holdora.fun |

## Overview

This repository holds the Holdora website: a static, dependency-free build that shows a live Solana market board, a contract-address slot and the project's confirmed links. Every external fact lives in one register record (`src/register.json`) with a state of `stated`, `absent` or `unconfirmed`. Anything that is not stated renders inert, with no value and no link.

## Features

- Contract slot at the top of the page: large, full address, click to copy. Inert until an address is stated.
- Live Solana board from public DexScreener data, top ten by 24h volume, with a ticker built from the same feed.
- Row #1 is always reserved for Holdora: a placeholder while the contract is pending, real figures once it is stated.
- Polling every 60 seconds, paused while the tab is hidden, exponential backoff, last good data kept on failure.
- Scroll-reveal springs, hero parallax, spotlight hover, count-up with flash, progress bar. All of it switches off under `prefers-reduced-motion`.

## Links

- X: https://x.com/holdora
- GitHub: pending
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)

## Build

```bash
npm run build   # src/ -> dist/ (deploy dist/)
npm run gates   # checks dist/, exits 0 only if every gate passes
npm run serve   # local preview of dist/ on http://127.0.0.1:4173
```

To state the contract address, edit the `ca` record in `src/register.json` (`"state": "stated"` plus a `"value"`), then rebuild.

## License

MIT, see [LICENSE](LICENSE).
