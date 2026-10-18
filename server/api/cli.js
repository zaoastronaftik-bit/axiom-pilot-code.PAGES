import { createHash } from 'node:crypto';
import { pool } from '../lib/auth.js';
import { cors, options, fail } from '../lib/http.js';

export default async function handler(req,res) {
  if (options(req,res)) return;
  if (!cors(req,res)) return fail(res,403,'Origin not permitted');
  if (req.method!=='GET') return fail(res,405,'Method not allowed');
  const m=/^Bearer\s+(axiom_cli_[A-Za-z0-9_-]{40,50})$/i.exec(req.headers.authorization??'');
  if (!m) return fail(res,401,'CLI access token required');
  const digest=createHash('sha256').update(m[1]).digest('hex');
  try {
    const q=await pool.query(`select t.id,t.user_id,p.plan from axiom_cli_tokens t
      join axiom_profiles p on p.user_id=t.user_id
      where t.token_hash=$1 and t.revoked_at is null and t.expires_at>now()`,[digest]);
    if (!q.rowCount) return fail(res,401,'Token invalid or expired');
    const row=q.rows[0];
    await pool.query('update axiom_cli_tokens set last_used_at=now() where id=$1',[row.id]);
    res.statusCode=200;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({authenticated:true,plan:row.plan,userId:row.user_id,tokenId:row.id}));
  } catch(e) {
    console.error('cli_token_check_failed',{code:e?.code??'unexpected'});
    return fail(res,503,'Service temporarily unavailable');
  }
}
