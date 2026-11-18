// Neon Harbor Capital — cbBTC/USDC trend bot for make.fun's "Race a BTC trading bot live
// for 24 hours" (agent-fun/bars-replay/v1).
//
// Strategy: slow trend-following, long only, one position at a time.
//   - Indicators, per symbol over its own closes (a gap adds nothing): EMA(96) and EMA(144),
//     each starting as the mean of its first span of closes, then moving 2 / (span + 1) of the
//     way to each new close. They read every batch, a warm-up's (hello.warmup_bars) included;
//     while warming up it sends no order (the replay would reject every one, warmup).
//   - Entry, on a bar's close (filled at the next open): EMA(96) crosses above EMA(144)
//     (above it now, at or under it on the symbol's bar before), on a symbol it does not hold.
//   - Exit, the whole position: EMA(96) falls back below EMA(144) (read as a level on every
//     bar, so a sell the market refuses is sent again on the next bar while it still holds),
//     or the position worth at least 1.5% over its cost at the close, or at least 1.2% under
//     it, or held for 240 bars without paying off.
//   - Stake: full equity (one symbol, one slot): each buy the smallest of equity,
//     caps.max_weight_bps of equity and the cash this reply has not spent yet; below
//     fees.min_notional_quote_units it buys nothing.
//   - Each order caps its slippage at MAX_SLIPPAGE_BPS = 100, 1% past the close it was decided
//     on, so a sell into a liquidity gap is refused (and sent again) rather than filled for
//     almost nothing; an entry the market refuses waits for the next cross.
//   - The EMAs run in float64 on + - * / alone, each correctly rounded (IEEE 754), so the same
//     bars give the same orders, run after run. No clock, no environment, no randomness.
//
// Why these numbers: on the dev window the market fell 2.8% overall with one +2% rally in the
// middle; fast EMAs (8/21) whipsaw 80 times and lose ~$148, while slow crosses (fast 84-108,
// slow 132-180) with a ~1.5% take-profit each make $7.50-$9.40 on 4-6 trades. EMA(96)/EMA(144)
// sits in the middle of that plateau: +$8.01 on the dev window, 4 trades, 0.7% max drawdown.

import { BPS, runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const FAST_BARS = 96;
const SLOW_BARS = 144;
/** Take profit: worth 10150/10000 of its cost (+1.5%). */
const TAKE_PROFIT_BPS = 150;
/** Stop loss: worth 9880/10000 of its cost (-1.2%). */
const STOP_LOSS_BPS = 120;
/** Time exit: a position held this many bars without paying off is closed, so a stagnant
 *  hold never drifts into the next down leg (on the dev window the second, sideways trade
 *  is cut at a small loss instead of drifting 269 bars; 180-240 bars all improve it). */
const MAX_HOLD_BARS = 240;
const MAX_SLIPPAGE_BPS = 100;

/** One EMA: the closes it has seen until it starts, then its value. */
interface Ema {
  span: number;
  warm: number[];
  value: number | null;
}

interface Series {
  fast: Ema;
  slow: Ema;
  /** fast - slow after the symbol's bar before this one, once both are set. */
  gap: number | null;
  /** The same after this bar. */
  now: number | null;
  /** Seq of the batch the current position's buy was decided on, or null when flat. */
  entryBar: number | null;
}

const series = new Map<string, Series>();

function step(e: Ema, close: number): void {
  if (e.value !== null) {
    e.value += (2 / (e.span + 1)) * (close - e.value);
    return;
  }
  e.warm.push(close);
  if (e.warm.length === e.span) e.value = e.warm.reduce((a, x) => a + x, 0) / e.span;
}

function push(bar: Bar): Series {
  let s = series.get(bar.symbol);
  if (s === undefined) {
    s = { fast: { span: FAST_BARS, warm: [], value: null }, slow: { span: SLOW_BARS, warm: [], value: null }, gap: null, now: null, entryBar: null };
    series.set(bar.symbol, s);
  }
  const c = Number(bar.c);
  step(s.fast, c);
  step(s.slow, c);
  s.gap = s.now;
  s.now = s.fast.value !== null && s.slow.value !== null ? s.fast.value - s.slow.value : null;
  return s;
}

/** Whether a held position exits on this close: fast below slow, its value at the take-profit
 *  or the stop-loss, or held for MAX_HOLD_BARS bars. */
function exits(state: BarsState, symbol: string, held: { qty: bigint; cost: bigint }, trendDown: boolean, entryBar: number | null): boolean {
  if (trendDown) return true;
  if (entryBar !== null && state.seq - entryBar >= MAX_HOLD_BARS) return true;
  const value = state.value(symbol, held.qty);
  return value * 10000n >= held.cost * BigInt(10000 + TAKE_PROFIT_BPS) || value * 10000n <= held.cost * BigInt(10000 - STOP_LOSS_BPS);
}

await runBars({
  onBatch(state, batch) {
    const crossUp = new Set<string>();
    const fresh = new Set<string>();
    for (const bar of batch.bars) {
      const s = push(bar);
      fresh.add(bar.symbol);
      if (s.gap === null || s.now === null || bar.v === '0') continue;
      if (s.now > 0 && s.gap <= 0) crossUp.add(bar.symbol);
    }
    if (state.warmingUp) return [];
    const { caps, fees } = state.hello;
    const sells: SellInput[] = [];
    const entries: string[] = [];
    for (const { symbol } of state.hello.symbols) {
      if (!fresh.has(symbol)) continue;
      const held = state.positions.get(symbol);
      const s = series.get(symbol)!;
      if (held !== undefined) {
        const trendDown = s.now !== null && s.now < 0;
        if (exits(state, symbol, held, trendDown, s.entryBar)) {
          sells.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
          s.entryBar = null;
        }
      } else if (crossUp.has(symbol)) {
        entries.push(symbol);
      }
    }

    const orders: (SellInput | BuyInput)[] = sells.slice(0, caps.max_orders_per_bar);
    const slots = Math.min(state.hello.symbols.length, caps.max_open_positions);
    const stake = state.equity / BigInt(slots);
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
    let room = slots - state.positions.size;
    let cash = state.cash;
    for (const symbol of entries) {
      if (room <= 0 || orders.length >= caps.max_orders_per_bar) break;
      let slice = stake < byWeight ? stake : byWeight;
      if (cash < slice) slice = cash;
      if (slice === 0n || slice < BigInt(fees.min_notional_quote_units)) break;
      orders.push({ side: 'buy', symbol, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
      series.get(symbol)!.entryBar = state.seq;
      cash -= slice;
      room--;
    }
    return orders;
  },
});
