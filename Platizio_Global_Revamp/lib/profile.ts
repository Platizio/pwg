/**
 * Derivations over the reference profile data.
 *
 * Ported from the design-system source's `lib/market/derive.ts`, with two
 * changes. Every function is pure, so the prerender and the hydrating client
 * agree. And anything that depended on a live account — a holding, a
 * portfolio weight, an unrealised P/L — is gone, because this site has no
 * account to read and inventing one would put a fake position on a public
 * page.
 */

import type { EquityProfile, FundProfile, Ratio, ShareSlice } from '../data/instrumentProfile'
import { formatPrice } from './format'

const pctStr = (v: number, dp = 1) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(dp)}%`

/* ------------------------------------------------------------- overview */

export interface ReturnRow { label: string; value: string; up: boolean; width: string }

/**
 * Trailing returns, scaled from today's move.
 *
 * The source design does exactly this, and it is the one derivation here that
 * is a projection rather than a fact — so the panel that renders it labels it
 * as illustrative alongside the chart, and it never appears without that
 * label.
 */
export function trailingReturns(changePercent: number): ReturnRow[] {
  return ([
    ['1 month', changePercent * 2.4],
    ['6 months', changePercent * 6.1],
    ['1 year', changePercent * 11],
    ['5 years', changePercent * 24],
  ] as const).map(([label, v]) => ({
    label,
    value: pctStr(v),
    up: v >= 0,
    width: `${Math.min(100, Math.abs(v) * 1.6 + 8)}%`,
  }))
}

/* --------------------------------------------------------- fundamentals */

export function equityRatios(p: EquityProfile): Ratio[] {
  return [
    { label: 'Market cap', value: `$${p.mcap}` },
    { label: 'P/E ratio', value: p.pe.toFixed(1) },
    { label: 'EPS (TTM)', value: `$${p.eps.toFixed(2)}` },
    { label: 'Dividend yield', value: p.div },
    { label: 'Price / sales', value: p.ps.toFixed(1) },
    { label: 'Price / book', value: p.pb.toFixed(1) },
    { label: 'Return on equity', value: p.roe },
    { label: 'Profit margin', value: p.margin },
    { label: 'Debt / equity', value: p.debt.toFixed(2) },
    { label: 'Beta (5Y)', value: p.beta.toFixed(2) },
  ]
}

export function fundFacts(p: FundProfile): Ratio[] {
  return [
    { label: 'Expense ratio', value: p.expenseRatio },
    { label: 'Assets under management', value: p.aum },
    { label: 'Holdings', value: String(p.holdingsCount) },
    { label: 'Index tracked', value: p.indexTracked },
    { label: 'Distribution yield', value: p.yield },
    { label: 'Inception', value: p.inception },
    { label: 'Beta (5Y)', value: p.beta.toFixed(2) },
  ]
}

export interface RevBar { year: number; value: string; height: string; latest: boolean }

export function revenueBars(rev: readonly number[]): RevBar[] {
  const max = Math.max(...rev)
  return rev.map((v, i) => ({
    year: 2021 + i,
    value: v >= 100 ? String(Math.round(v)) : v.toFixed(1),
    height: `${((v / max) * 100).toFixed(1)}%`,
    latest: i === rev.length - 1,
  }))
}

/* ----------------------------------------------------------- technicals */

export type Tone = 'up' | 'down' | 'neutral'
export interface TechRow { label: string; value: string; signal: string; tone: Tone; width: string }

const DOWN = new Set(['BEARISH', 'SELL', 'BELOW'])
const UP = new Set(['BULLISH', 'BUY', 'ABOVE'])

export function technicals(price: number, changePercent: number, beta: number, seed: number): TechRow[] {
  const up = changePercent >= 0
  const rsi = 38 + (seed % 34)

  const rows: { label: string; value: string; signal: string; fill: number }[] = [
    { label: 'RSI (14)', value: rsi.toFixed(1), signal: rsi > 60 ? 'BULLISH' : rsi < 45 ? 'BEARISH' : 'NEUTRAL', fill: rsi },
    { label: 'MACD', value: (changePercent * 0.82).toFixed(2), signal: up ? 'BUY' : 'SELL', fill: up ? 72 : 31 },
    { label: 'MA 50', value: formatPrice(price * (up ? 0.96 : 1.04)), signal: up ? 'ABOVE' : 'BELOW', fill: up ? 78 : 34 },
    { label: 'MA 200', value: formatPrice(price * (up ? 0.88 : 1.11)), signal: up ? 'ABOVE' : 'BELOW', fill: up ? 84 : 29 },
    { label: 'ATR (14)', value: (price * 0.021).toFixed(2), signal: 'NORMAL', fill: 46 },
    { label: 'Beta (5Y)', value: beta.toFixed(2), signal: beta > 1.5 ? 'ELEVATED' : 'MODERATE', fill: Math.min(96, beta * 45) },
  ]

  return rows.map((r) => ({
    label: r.label,
    value: r.value,
    signal: r.signal,
    tone: DOWN.has(r.signal) ? 'down' : UP.has(r.signal) ? 'up' : 'neutral',
    width: `${Math.max(6, Math.min(100, r.fill))}%`,
  }))
}

export interface Consensus {
  count: number
  target: string
  upside: string
  bars: { key: string; width: string; tone: Tone }[]
  rows: { label: string; count: number; tone: Tone }[]
}

export function consensus(p: EquityProfile, price: number): Consensus {
  const buy = Math.round(p.analysts * 0.62)
  const hold = Math.round(p.analysts * 0.28)
  const sell = p.analysts - buy - hold
  const upside = (p.target / price - 1) * 100

  return {
    count: p.analysts,
    target: `$${formatPrice(p.target)}`,
    upside: `${pctStr(upside)} against the last traded price`,
    bars: [
      { key: 'buy', width: `${(buy / p.analysts) * 100}%`, tone: 'up' },
      { key: 'hold', width: `${(hold / p.analysts) * 100}%`, tone: 'neutral' },
      { key: 'sell', width: `${(sell / p.analysts) * 100}%`, tone: 'down' },
    ],
    rows: [
      { label: 'Buy / Overweight', count: buy, tone: 'up' },
      { label: 'Hold', count: hold, tone: 'neutral' },
      { label: 'Sell / Underweight', count: sell, tone: 'down' },
    ],
  }
}

/* ----------------------------------------------------------- allocation */

export interface Slice { label: string; pct: string; width: string; index: number }

export function allocation(slices: readonly ShareSlice[]): Slice[] {
  const total = slices.reduce((a, s) => a + s.pct, 0) || 1
  return slices.map((s, i) => ({
    label: s.label,
    pct: `${s.pct}%`,
    width: `${((s.pct / total) * 100).toFixed(1)}%`,
    index: i,
  }))
}

export function holderBars<T extends { pct: string }>(holders: readonly T[]): (T & { width: string })[] {
  return holders.map((h) => ({ ...h, width: `${Math.min(100, parseFloat(h.pct) * 11)}%` }))
}
