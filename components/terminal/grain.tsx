/**
 * Film grain over the shell.
 *
 * The source renders a live `feTurbulence` filter across the whole surface.
 * That re-rasterises on every paint, which is a measurable cost on low-end
 * mobile for a static texture. Here the same turbulence is serialised once into
 * a data URI, so the browser decodes a single tile and repeats it.
 */
const NOISE = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="4" stitchTiles="stitch"/></filter><rect width="180" height="180" filter="url(#n)"/></svg>`;

const NOISE_URI = `url("data:image/svg+xml;base64,${Buffer.from(NOISE).toString("base64")}")`;

export function Grain() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[9] opacity-[0.09] mix-blend-overlay"
      style={{ backgroundImage: NOISE_URI, backgroundRepeat: "repeat" }}
    />
  );
}
