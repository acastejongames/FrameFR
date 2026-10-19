import { useEffect, useState } from 'react'
import type { Map } from 'maplibre-gl'

interface MapCompassProps {
  map: Map
}

function normalizeBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360
}

/** Shortest signed rotation needed to point the camera back to north. */
export function northResetDelta(bearing: number): number {
  return ((0 - bearing + 540) % 360) - 180
}

/**
 * Small map compass. The dial counter-rotates with the MapLibre bearing, so
 * its N marker always points towards geographic north on screen. Clicking it
 * only resets bearing: centre, zoom and pitch remain exactly as the user left
 * them.
 */
export function MapCompass({ map }: MapCompassProps) {
  const [bearing, setBearing] = useState(() => normalizeBearing(map.getBearing()))

  useEffect(() => {
    const updateBearing = (): void => setBearing(normalizeBearing(map.getBearing()))
    updateBearing()
    map.on('rotate', updateBearing)
    map.on('move', updateBearing)
    return () => {
      map.off('rotate', updateBearing)
      map.off('move', updateBearing)
    }
  }, [map])

  const resetNorth = (): void => {
    const current = map.getBearing()
    const delta = northResetDelta(current)
    if (Math.abs(delta) < 0.01) return
    map.easeTo({ bearing: current + delta, duration: 450, essential: true })
  }

  const roundedBearing = Math.round(bearing) % 360

  return (
    <button
      type="button"
      className="map-compass"
      onClick={resetNorth}
      aria-label={`Restablecer norte. Orientación actual: ${roundedBearing} grados`}
      title="Restablecer norte"
    >
      <span
        className="map-compass-dial"
        style={{ transform: `rotate(${-bearing}deg)` }}
        aria-hidden="true"
      >
        <span className="map-compass-north">N</span>
        <span className="map-compass-needle" />
        <span className="map-compass-south">S</span>
      </span>
    </button>
  )
}
