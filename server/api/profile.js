import { auth, pool } from '../lib/auth.js';
import { cors, options, fail, toHeaders } from '../lib/http.js';

export default async function handler(req, res) {
  if (options(req, res)) return;
  if (!cors(req, res)) return fail(res, 403, 'Origin not permitted');
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');
  if (!/^Bearer\s+[^\s]+$/i.test(req.headers.authorization ?? '')) return fail(res, 401, 'Authentication required');
  try {
    const session = await auth.api.getSession({ headers: toHeaders(req.headers) });
    if (!session?.user?.id) return fail(res, 401, 'Authentication required');
    const user = session.user;
    // Plan is database-owned and not accepted from client requests.
    await pool.query('insert into axiom_profiles (user_id) values ($1) on conflict (user_id) do nothing', [user.id]);
    const result = await pool.query('select plan, created_at from axiom_profiles where user_id = $1', [user.id]);
    const profile = result.rows[0];
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ id: user.id, email: user.email, plan: profile.plan, createdAt: profile.created_at }));
  } catch (err) {
    console.error('profile_failure', { code: err?.code ?? 'unexpected' });
    return fail(res, 503, 'Profile temporarily unavailable');
  }
}
