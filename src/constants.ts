export const TRADING_PLATFORM_URL = 'https://trade.clientbridge.in/login?platizioglobal'
export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@platizioglobal'
export const WHATSAPP_URL = 'https://wa.me/919289837100'
export const APP_STORE_URL = 'https://apps.apple.com/in/app/platizio-global/id6789550428'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.platizio.global'

/**
 * The market terminal.
 *
 * It used to be a separate Next.js app in screener/, reached at /screener via
 * a vite.config.ts dev proxy. The migration folded it into this application,
 * where it serves from /terminal — so /screener and /screener/instrument/<t>
 * no longer resolve, and every link built from them 404'd.
 *
 * These now delegate to lib/market/paths.ts, which is the single source of
 * truth for terminal routing. Two behaviours changed with the move, both
 * deliberately:
 *
 *   - No .toLowerCase(). /terminal/[ticker] prerenders the covered universe
 *     in upper case (COVERED = AAPL, TSLA, …); a lower-cased URL missed that
 *     set and rendered on demand instead of being served from the build.
 *   - Tickers are percent-encoded, because they carry . and / (BRK.B, RDS/A).
 */
import { TERMINAL_PATH, instrumentPath } from '@/lib/market/paths'

export const SCREENER_URL = TERMINAL_PATH
export const screenerInstrument = (ticker: string) => instrumentPath(ticker)
