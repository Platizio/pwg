import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { WHATSAPP_URL } from '../constants'

const APPEAR_DELAY_MS = 5000

/**
 * Routes that own their own support entry point, where this button would be both
 * redundant and in the way. On /help it lands directly on the assistant's send
 * button at mobile widths, and the assistant already offers WhatsApp as the
 * call-back route.
 */
const SUPPRESSED_ON = ['/help']

export default function WhatsAppFloat() {
  const [visible, setVisible] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), APPEAR_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null
  if (SUPPRESSED_ON.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return null
  }

  return (
    <a
      className="whatsapp-float"
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
    >
      <span className="whatsapp-float-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.5 3.5A10.4 10.4 0 0 0 12 .5 10.5 10.5 0 0 0 2.9 16.2L1.5 22l5.9-1.5a10.5 10.5 0 0 0 4.6 1.1A10.5 10.5 0 0 0 22.5 11 10.4 10.4 0 0 0 20.5 3.5zM12 19.8a8.7 8.7 0 0 1-4.4-1.2l-.3-.2-3.5.9.9-3.4-.2-.4A8.7 8.7 0 1 1 12 19.8zm4.9-6.5c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1c-.2.3-.7.9-.8 1-.2.2-.3.2-.5.1a7.2 7.2 0 0 1-3.6-3.2c-.3-.5.3-.4.8-1.4.1-.2 0-.3 0-.5l-.9-2c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.6 1.1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.7 3.1.6.5 0 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1 0-.2-.1-.5-.2z" />
        </svg>
      </span>
      <span className="whatsapp-float-label">Chat with us</span>
    </a>
  )
}
