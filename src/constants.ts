export const TRADING_PLATFORM_URL = 'https://trade.clientbridge.in/login?platizioglobal'
export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@platizioglobal'
export const WHATSAPP_URL = 'https://wa.me/919289837100'
export const APP_STORE_URL = 'https://apps.apple.com/in/app/platizio-global/id6789550428'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.platizio.global'

/**
 * The market terminal in screener/ — a separate Next.js app.
 *
 * Localhost for now. Deployment is a later task (Render), and when it lands
 * this is the one line that changes.
 */
export const SCREENER_URL = 'http://localhost:3000'
export const screenerInstrument = (ticker: string) =>
  `${SCREENER_URL}/instrument/${ticker.toLowerCase()}`
