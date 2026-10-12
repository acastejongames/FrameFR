import { useCallback, useSyncExternalStore } from 'react'
import { EMPTY_SNAPSHOT, type FleetController, type FleetSnapshot } from '@/engine/fleetController'

const noopSubscribe = () => () => undefined

/**
 * Bridges the imperative `FleetController` and React. The controller notifies
 * subscribers twice per second, so the UI never re-renders at animation speed.
 */
export function useFleetSnapshot(controller: FleetController | null): FleetSnapshot {
  const subscribe = useCallback(
    (onChange: () => void) => (controller ? controller.subscribe(onChange) : noopSubscribe()),
    [controller],
  )
  const getSnapshot = useCallback(
    () => (controller ? controller.getSnapshot() : EMPTY_SNAPSHOT),
    [controller],
  )
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT)
}
