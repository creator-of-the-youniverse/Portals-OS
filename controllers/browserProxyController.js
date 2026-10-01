import axios from 'axios';

export async function proxyBrowserHandler(req, res) {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing target URL');
  }

  // Basic URL validation
  try {
    new URL(targetUrl);
  } catch {
    return res.status(400).send('Invalid URL');
  }

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PortalsOS/1.0 SovereignAgent',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      responseType: 'text',
      timeout: 10000,
      // Don't follow redirects that would break the base tag
      maxRedirects: 5,
    });

    // Strip frame-blocking headers from upstream response
    res.setHeader('Content-Type', response.headers['content-type'] || 'text/html');
    // We intentionally do NOT forward X-Frame-Options or CSP frame-ancestors here

    let html = response.data;

    // Inject a base tag so relative links resolve correctly against the target domain
    const baseTag = `<base href="${targetUrl}">`;
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${baseTag}`);
    } else if (html.includes('<HEAD>')) {
      html = html.replace('<HEAD>', `<HEAD>${baseTag}`);
    } else {
      html = baseTag + html;
    }

    return res.send(html);
  } catch (error) {
    const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
    const reason = isTimeout
      ? 'The target site timed out.'
      : 'The target site refused the connection or blocked access.';

    console.error(`[Browser Proxy] Error for ${targetUrl}:`, error.message);

    return res.status(502).send(`<!DOCTYPE html>
<html>
<head><title>Navigation Blocked</title></head>
<body style="background:#09090b;color:#f4f4f5;font-family:monospace;padding:40px;text-align:center;margin:0;">
  <div style="max-width:480px;margin:80px auto;background:#18181b;border:1px solid #27272a;border-radius:12px;padding:40px;">
    <div style="font-size:32px;margin-bottom:16px;">🛡️</div>
    <h2 style="color:#f4f4f5;margin:0 0 8px;font-size:16px;">Sovereign Gateway: Navigation Blocked</h2>
    <p style="color:#71717a;font-size:13px;margin:0 0 24px;line-height:1.6;">${reason}<br>Some sites prevent framing as a security policy.</p>
    <a href="${targetUrl}" target="_blank"
      style="display:inline-block;padding:10px 20px;background:#10b981;color:#09090b;text-decoration:none;border-radius:8px;font-weight:bold;font-size:13px;">
      Open in External Browser ↗
    </a>
  </div>
</body>
</html>`);
  }
}
