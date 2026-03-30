/** Shared Socket.IO API URL resolution for browser games (dev proxy vs production). */

const DEFAULT_RENDER_API = 'https://footbollsnakegame-api.onrender.com'

export function normalizeOriginInput(raw: string): string {
  return raw.trim().replace(/\/$/, '')
}

export function usableApiUrl(candidate: string, pageOrigin: string): string | null {
  const s = normalizeOriginInput(candidate)
  if (!s) return null
  try {
    const u = new URL(s)
    if (u.origin === pageOrigin) return null
    return s
  } catch {
    return null
  }
}

type SocketFileConfig = {
  publicSiteUrl?: string
  apiOrigin?: string
  apiOrigins?: string[]
}

function collectCandidates(
  page: string,
  envRaw: string,
  file: SocketFileConfig | null,
): string[] {
  const rawList: string[] = []
  if (envRaw) rawList.push(envRaw)
  if (file?.apiOrigins) rawList.push(...file.apiOrigins)
  if (file?.apiOrigin) rawList.push(file.apiOrigin)
  rawList.push(DEFAULT_RENDER_API)

  const out: string[] = []
  const seen = new Set<string>()
  for (const r of rawList) {
    const u = usableApiUrl(r, page)
    if (u && !seen.has(u)) {
      seen.add(u)
      out.push(u)
    }
  }
  return out
}

export async function healthOk(base: string): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const id = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(`${base}/health`, { mode: 'cors', signal: ctrl.signal })
    clearTimeout(id)
    return r.ok
  } catch {
    return false
  }
}

export type ResolveResult =
  | { ok: true; url: string; label: string }
  | { ok: false; message: string }

export async function resolveProductionSocket(): Promise<ResolveResult> {
  const page = window.location.origin
  const envRaw = import.meta.env.VITE_SERVER_URL?.trim() ?? ''

  let file: SocketFileConfig | null = null
  try {
    const res = await fetch('/socket-config.json', { cache: 'no-store' })
    if (res.ok) file = (await res.json()) as SocketFileConfig
  } catch {
    /* ignore */
  }

  const candidates = collectCandidates(page, envRaw, file)
  if (candidates.length === 0) {
    return {
      ok: false,
      message:
        'No API URL available. Deploy the /server app and set public/socket-config.json or VITE_SERVER_URL.',
    }
  }

  for (const url of candidates) {
    if (await healthOk(url)) {
      const fromEnv = usableApiUrl(envRaw, page) === url
      const hint = fromEnv ? 'env' : 'discovered via /health'
      return { ok: true, url, label: `${url} (${hint})` }
    }
  }

  const fallback = candidates[0]!
  return {
    ok: true,
    url: fallback,
    label: `${fallback} (/health not OK — service may be sleeping or not created yet; use Deploy link)`,
  }
}

/** Socket.IO `origin` (no path): dev uses Vite host for `/socket.io` proxy. */
export async function getSocketOrigin(): Promise<{ origin: string; label: string }> {
  if (import.meta.env.DEV) {
    return { origin: window.location.origin, label: `${window.location.origin} (Vite proxy → Socket.IO)` }
  }
  const r = await resolveProductionSocket()
  if (!r.ok) throw new Error(r.message)
  return { origin: r.url, label: r.label }
}
