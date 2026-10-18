import { cors, options, fail } from '../lib/http.js';

export default function handler(req, res) {
  if (options(req, res)) return;
  if (!cors(req, res)) return fail(res, 403, 'Origin not permitted');
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = 200;
  res.end(JSON.stringify({ service: 'axiompilot-account-api', ok: true, version: '1.0.0-rc.1', passwordRecovery: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM) }));
}
