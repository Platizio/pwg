import { markTint } from '../../data/terminalUniverse'

interface MarkProps {
  symbol: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * The instrument monogram: a hairline square holding one serif letter.
 *
 * Never filled. The instrument's colour lives in the letter rather than behind
 * it, which is what stops thirteen tinted symbols turning a rail into
 * confetti. The tint is derived from the symbol so it is identical on the
 * server and in the browser, and stable between visits.
 */
export default function Mark({ symbol, size = 'md' }: MarkProps) {
  return (
    <span className={`m-mark m-mark--${size} t-${markTint(symbol)}`} aria-hidden="true">
      {symbol.charAt(0)}
    </span>
  )
}
