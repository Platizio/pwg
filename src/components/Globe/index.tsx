"use client"

// Compose the Globe using the Framer-style HOC pattern:
//
//   Globe = withHover(withRotate(GlobeBase))
//
// Reading order (outer → inner):
//   withHover  — sets globeState.isHovering on mouse enter/leave
//   withRotate — runs a RAF loop that increments globeState.phi
//   GlobeBase  — renders the cobe WebGL canvas + Delhi pin overlay

import GlobeBase from './GlobeBase'
import { withRotate } from './withRotate'
import { withHover } from './withHover'

export const Globe = withHover(withRotate(GlobeBase))
export default Globe
