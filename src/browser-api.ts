function apiError(body: unknown, fallback: string): Error {
  if (body && typeof body === 'object' && 'error' in body) {
    const value = (body as { error?: unknown }).error
    if (typeof value === 'string') return new Error(value)
    if (value && typeof value === 'object' && 'message' in value && typeof (value as { message?: unknown }).message === 'string') {
      return new Error((value as { message: string }).message)
    }
  }
  return new Error(fallback)
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await response.json().catch(() => undefined) as unknown
  if (!response.ok) throw apiError(body, `LABO web request failed (${response.status})`)
  return body as T
}

async function openAISettings(): Promise<OpenAISettingsStatus> {
  const response = await fetch('/api/labo/key', { credentials: 'same-origin' })
  if (response.status === 401) return { configured: false, source: 'none', encryptionAvailable: true, authRequired: true }
  const body = await response.json().catch(() => undefined) as unknown
  if (!response.ok) throw apiError(body, `LABO web request failed (${response.status})`)
  return body as OpenAISettingsStatus
}

export function installBrowserApi(): void {
  if (window.labo || window.location.protocol === 'file:') return

  window.labo = {
    platform: 'web',
    runtime: 'web',
    askLabo: (payload) => requestJson('/api/labo/ask', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    getOpenAISettings: openAISettings,
    saveOpenAIKey: (apiKey) => requestJson('/api/labo/key', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    }),
    deleteOpenAIKey: () => requestJson('/api/labo/key', { method: 'DELETE' }),
    testOpenAIKey: () => requestJson('/api/labo/key/test', { method: 'POST' }),
    loadWebWorkspace: () => requestJson('/api/labo/workspace'),
    saveWebWorkspace: (payload) => requestJson('/api/labo/workspace', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  }
}
