/**
 * Откриване на локалния helper agent.
 *
 * Агентът слуша на два адреса: HTTP на 17357 (винаги) и HTTPS на 17358 (на
 * macOS, със сертификат от локален CA, добавен от инсталатора). HTTPS-ът
 * съществува заради Safari — единственият браузър, който блокира
 * `http://127.0.0.1` от HTTPS страница като mixed content
 * (WebKit bug 171934). Затова HTTPS се пробва пръв: в Safari само той работи,
 * а другаде и двата вършат работа.
 *
 * Старите инсталации нямат HTTPS порт, затова HTTP остава като резерва —
 * фронтендът не бива да чупи агент, който още не е обновен.
 */
export const AGENT_BASES = ['https://127.0.0.1:17358', 'http://127.0.0.1:17357'] as const;

export interface AgentProbeResult {
  base: string;
  version: string | null;
  tlsExpires: string | null;
}

interface HealthBody {
  version?: string;
  tls?: { enabled?: boolean; expires?: string | null };
}

async function probeOne(base: string, timeoutMs: number): Promise<AgentProbeResult> {
  const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`health ${res.status}`);
  const body = (await res.json()) as HealthBody;
  return { base, version: body.version ?? null, tlsExpires: body.tls?.expires ?? null };
}

/**
 * Пробва адресите по ред и връща първия, който отговори. Хвърля последната
 * грешка, ако никой не отговори — извикващият различава timeout от отказана
 * връзка по `err.name`.
 */
export async function probeAgent(timeoutMs = 2000): Promise<AgentProbeResult> {
  let lastError: unknown = new Error('no agent bases configured');
  for (const base of AGENT_BASES) {
    try {
      return await probeOne(base, timeoutMs);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
