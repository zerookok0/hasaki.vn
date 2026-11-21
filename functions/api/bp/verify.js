/**
 * POST /api/bp/verify —— 只有 config.json 里 enable_verify=true 时 connector 才调用。
 * 纯静态部署（enable_verify=false）下不会被走到；保留是为了换配置时能直接切。
 */
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';
  const panel = env.PANEL_ORIGIN;
  if (!panel) return Response.json({ ok: true, skipped: 'no_panel_origin' });
  try {
    const r = await fetch(panel + '/api/UserEnvironmentDetection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
      body: JSON.stringify({ user_ip: ip, user_agent: ua, referer: body.referer || '' }),
    });
    const j = await r.json().catch(() => null);
    if (j && j.status === 'success') return Response.json({ ok: true, data: j.data });
    return Response.json({ ok: false, reason: (j && j.data && j.data.reason) || 'denied' });
  } catch (e) {
    return Response.json({ ok: false, reason: 'panel_unreachable' });
  }
}
