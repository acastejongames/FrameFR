/**
 * Aircraft sprites.
 *
 * The icons are generated at runtime on a canvas instead of shipping a sprite
 * sheet: it keeps the bundle small, the colours in sync with the palette and
 * the icons crisp on high-DPI screens.
 *
 * The drawing itself lives in `src/map/silhouettes.ts`; this module only maps
 * an aircraft to the right sprite.
 */

import { resolveSilhouette, type SilhouetteId } from '@/data/aircraftTypes'
import { silhouetteImageId, type SilhouetteState } from './silhouettes'

export { buildSilhouetteIcons as buildAircraftIcons } from './silhouettes'
export { silhouetteImageId, type GeneratedIcon } from './silhouettes'

/**
 * Picks the sprite for an aircraft.
 *
 * @param family    Silhouette family, resolved from the type designator.
 * @param onGround  Aircraft is on the ground (grey sprite).
 * @param selected  Aircraft is the one selected in the UI (orange sprite).
 */
export function aircraftIconId(
  family: SilhouetteId | undefined,
  onGround: boolean,
  selected: boolean,
): string {
  const state: SilhouetteState = selected ? 'sel' : onGround ? 'gnd' : 'air'
  return silhouetteImageId(family ?? resolveSilhouette(undefined), state)
}
