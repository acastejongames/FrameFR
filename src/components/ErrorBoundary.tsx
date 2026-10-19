import { Component, type ReactNode } from 'react'

/** Keep an unexpected UI exception from leaving an unexplained blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="grid h-full place-content-center gap-4 p-8 text-center text-white" role="alert">
      <h1 className="text-xl font-bold">No se ha podido iniciar AeroScope</h1>
      <p>Recarga la página. Si el error persiste, puedes restablecer las preferencias de esta aplicación.</p>
      <button className="rounded bg-accent p-3 text-black" onClick={() => window.location.reload()}>Recargar</button>
      <button className="rounded border p-3" onClick={() => {
        try {
          Object.keys(localStorage).filter(key => key.startsWith('aeroscope:')).forEach(key => localStorage.removeItem(key))
        } catch { /* Storage can be disabled. */ }
        window.location.reload()
      }}>Restablecer preferencias de AeroScope</button>
    </main>
  }
}
