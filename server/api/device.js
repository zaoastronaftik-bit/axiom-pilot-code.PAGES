import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { pool, auth } from '../lib/auth.js';
import { cors, options, fail, toHeaders } from '../lib/http.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => {
  const bytes = randomBytes(8);
  const code = [...bytes].map(b => alphabet[b % alphabet.length]).join('');
  return code.slice(0, 4) + '-' + code.slice(4);
};
const website = 'https://zaoastronaftik-bit.github.io/axiom-pilot-code.PAGES/';

function getBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  if (typeof req.body === 'string' && req.body.length <= 4096) return JSON.parse(req.body);
  return {};
}

async function getAuthenticatedUser(req) {
  if (!/^Bearer\s+\S+$/i.test(req.headers.authorization ?? '')) return null;
  const info = await auth.api.getSession({ headers: toHeaders(req.headers) });
  return info?.user?.id || null;
}

export default async function handler(req, res) {
  if (options(req, res)) return;
  if (!cors(req, res)) return fail(res, 403, 'Origin not permitted');
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  let body;
  try { body = getBody(req); }
  catch { return fail(res, 400, 'Invalid JSON'); }
  const action = typeof req.query?.action === 'string' ? req.query.action : '';
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    if (action === 'start') {
      // Called by the local CLI: no account is required. It cannot authorize itself.
      const deviceCode = randomBytes(32).toString('base64url');
      const userCode = newCode();
      await pool.query('insert into axiom_device_authorizations (device_code_hash,user_code) values ($1,$2)', [hash(deviceCode), userCode]);
      res.statusCode = 200;
      return res.end(JSON.stringify({deviceCode,userCode,expiresIn:600,interval:5,verificationUri:website+'?device='+encodeURIComponent(userCode)}));
    }
    if (action === 'approve') {
      const userId = await getAuthenticatedUser(req);
      if (!userId) return fail(res, 401, 'Sign in before connecting the CLI');
      const userCode = String(body.userCode ?? '').trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(userCode)) return fail(res, 400, 'Invalid code');
      const q = await pool.query("update axiom_device_authorizations set status='approved',user_id=$1 where user_code=$2 and status='pending' and expires_at>now() returning user_code", [userId,userCode]);
      if (!q.rowCount) return fail(res, 404, 'Code not found or already used');
      res.statusCode = 200;
      return res.end(JSON.stringify({approved:true}));
    }
    if (action === 'poll') {
      const deviceCode = String(body.deviceCode ?? '');
      if (!/^[A-Za-z0-9_-]{40,50}$/.test(deviceCode)) return fail(res,400,'Invalid device code');
      const conn = await pool.connect();
      try {
        await conn.query('begin');
        const q = await conn.query('select status,user_id from axiom_device_authorizations where device_code_hash=$1 and expires_at>now() for update',[hash(deviceCode)]);
        if (!q.rowCount) { await conn.query('rollback');return fail(res,400,'Expired device code'); }
        const row=q.rows[0];
        if (row.status === 'pending') { await conn.query('rollback');res.statusCode=202;return res.end(JSON.stringify({status:'pending',interval:5})); }
        if (row.status !== 'approved'||!row.user_id) { await conn.query('rollback');return fail(res,403,'Authorization unavailable'); }
        const plainToken='axiom_cli_'+randomBytes(32).toString('base64url');
        const tokenId=randomUUID();
        await conn.query('insert into axiom_cli_tokens (id,user_id,token_hash) values ($1,$2,$3)',[tokenId,row.user_id,hash(plainToken)]);
        await conn.query("update axiom_device_authorizations set status='used' where device_code_hash=$1",[hash(deviceCode)]);
        await conn.query('commit');
        res.statusCode=200;
        return res.end(JSON.stringify({status:'authorized',accessToken:plainToken,tokenType:'Bearer',expiresIn:7776000}));
      } catch (e) { await conn.query('rollback').catch(()=>{});throw e; }
      finally { conn.release(); }
    }
    return fail(res,404,'Unknown action');
  } catch(e) {
    // PostgreSQL unique collision for a random code: CLI can retry start.
    console.error('device_failure',{code:e?.code??'unexpected'});
    return fail(res,503,'Service temporarily unavailable');
  }
}
