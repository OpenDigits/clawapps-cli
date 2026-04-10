import { LOGO_BASE64 } from './logo-data.js';

const BASE_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #050810;
    color: #F8FAFC;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    overflow: hidden;
  }
  /* Subtle gradient orbs in background */
  body::before, body::after {
    content: '';
    position: fixed;
    border-radius: 50%;
    filter: blur(120px);
    opacity: 0.15;
    pointer-events: none;
  }
  body::before {
    width: 600px; height: 600px;
    background: #8B5CF6;
    top: -200px; right: -100px;
  }
  body::after {
    width: 400px; height: 400px;
    background: #6366F1;
    bottom: -150px; left: -100px;
  }
  .card {
    position: relative;
    background: rgba(15, 22, 41, 0.8);
    border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: 16px;
    padding: 3rem 2.5rem;
    text-align: center;
    max-width: 420px;
    width: 90vw;
    backdrop-filter: blur(20px);
    box-shadow: 0 0 40px rgba(139, 92, 246, 0.08);
  }
  .logo {
    width: 80px; height: 80px;
    margin: -15px auto 0.5rem;
  }
  .logo img {
    width: 100%; height: 100%;
    object-fit: contain;
  }
  .brand {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 1.25rem;
    font-weight: 700;
    color: #F8FAFC;
    margin-bottom: 1rem;
    letter-spacing: -0.02em;
  }
  .brand span { color: #8B5CF6; }
  .subtitle {
    font-size: 0.8rem;
    color: #64748B;
    margin-bottom: 2rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .spinner {
    width: 36px; height: 36px;
    border: 3px solid rgba(139, 92, 246, 0.15);
    border-top-color: #8B5CF6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 1.25rem;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .status {
    font-size: 0.95rem;
    color: #94A3B8;
    line-height: 1.5;
  }
  .status.success {
    color: #22C55E;
    font-weight: 500;
  }
  .status.error {
    color: #EF4444;
    font-weight: 500;
  }
  .check-icon {
    width: 48px; height: 48px;
    margin: 0 auto 1rem;
    background: rgba(34, 197, 94, 0.1);
    border-radius: 50%;
    display: none;
    align-items: center;
    justify-content: center;
  }
  .check-icon svg { width: 24px; height: 24px; }
  .error-icon {
    width: 48px; height: 48px;
    margin: 0 auto 1rem;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 50%;
    display: none;
    align-items: center;
    justify-content: center;
  }
  .error-icon svg { width: 24px; height: 24px; }
  .hint {
    margin-top: 1.5rem;
    font-size: 0.8rem;
    color: #475569;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .card { animation: fadeIn 0.4s ease-out; }
`;

const LOGO_IMG = `<img src="data:image/png;base64,${LOGO_BASE64}" alt="ClawApps">`;

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="20 6 9 17 4 12"/>
</svg>`;

const ERROR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
</svg>`;

/**
 * HTML page served at /callback for Google OAuth implicit flow.
 */
export function getGoogleCallbackHtml(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Welcome to ClawApps</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="logo">${LOGO_IMG}</div>
    <div class="brand">Welcome to Claw<span>Apps</span></div>
    <div class="spinner" id="spinner"></div>
    <div class="check-icon" id="checkIcon">${CHECK_SVG}</div>
    <div class="error-icon" id="errorIcon">${ERROR_SVG}</div>
    <p class="status" id="status">Completing authentication...</p>
    <p class="hint" id="hint">Please wait while we verify your credentials</p>
  </div>
  <script>
    (async function() {
      const status = document.getElementById('status');
      const spinner = document.getElementById('spinner');
      const checkIcon = document.getElementById('checkIcon');
      const errorIcon = document.getElementById('errorIcon');
      const hint = document.getElementById('hint');

      try {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');

        if (!accessToken) {
          throw new Error('No access token received from Google');
        }

        const res = await fetch('http://localhost:${port}/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: accessToken }),
        });

        if (!res.ok) throw new Error('Failed to send token to CLI');

        spinner.style.display = 'none';
        checkIcon.style.display = 'flex';
        status.textContent = 'Authentication successful!';
        status.className = 'status success';
        hint.textContent = 'You can close this tab and return to the terminal.';
      } catch (err) {
        spinner.style.display = 'none';
        errorIcon.style.display = 'flex';
        status.textContent = err.message;
        status.className = 'status error';
        hint.textContent = 'Please try running clawapps login again.';
      }
    })();
  </script>
</body>
</html>`;
}

/**
 * Success page shown after Apple OAuth callback.
 */
export function getSuccessHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Welcome to ClawApps</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="logo">${LOGO_IMG}</div>
    <div class="brand">Welcome to Claw<span>Apps</span></div>
    <div class="check-icon" style="display:flex">${CHECK_SVG}</div>
    <p class="status success">Authentication successful!</p>
    <p class="hint">You can close this tab and return to the terminal.</p>
  </div>
</body>
</html>`;
}

/**
 * Error page shown when something goes wrong.
 */
export function getErrorHtml(message: string): string {
  const safeMessage = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Welcome to ClawApps</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="logo">${LOGO_IMG}</div>
    <div class="brand">Welcome to Claw<span>Apps</span></div>
    <div class="error-icon" style="display:flex">${ERROR_SVG}</div>
    <p class="status error">${safeMessage}</p>
    <p class="hint">Please try running clawapps login again.</p>
  </div>
</body>
</html>`;
}
