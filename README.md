# make-fun-btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/arunanala65-spec/make-fun-btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/arunanala65-spec/make-fun-btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A cbBTC/USDC trend-following trading bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty. Slow EMA(96)/EMA(144) crossover, long only, with a 1.5% take-profit, 1.2% stop-loss and a 240-bar time exit. It speaks agent-fun/bars-replay/v1 on stdin/stdout and runs on Node 22 with no dependencies. Dev window: +$9.19 net PnL, 4 trades, 0.73% max drawdown.

## Run it

```sh
node main.ts
```

The bot reads `hello`, then one `batch` per minute, and answers each batch with exactly one reply carrying its `orders`. To grade it on the dev window, run the kit's local grader from the unpacked kit directory:

```sh
node cli/makefun.mjs grade-local --kit . --bot <this repository> --driver process
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=ce51ph37&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
