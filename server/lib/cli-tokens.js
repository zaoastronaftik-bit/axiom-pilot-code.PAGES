import { createHash } from "node:crypto";
import { cors, options, fail, toHeaders } from "./http.js";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const json = (res, data) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
};
export function cliHandler(pool) {
  return async (req, res) => {
    if (options(req, res)) return;
    if (!cors(req, res)) return fail(res, 403, "Origin not permitted");
    const revoke = req.method === "POST" && req.query?.action === "revoke";
    if (req.method !== "GET" && !revoke)
      return fail(res, 405, "Method not allowed");
    const m = /^Bearer\s+(axiom_cli_[A-Za-z0-9_-]{40,50})$/i.exec(
      req.headers.authorization ?? "",
    );
    if (!m) return fail(res, 401, "CLI access token required");
    try {
      if (revoke) {
        await pool.query(
          "update axiom_cli_tokens set revoked_at=coalesce(revoked_at,now()) where token_hash=$1",
          [hash(m[1])],
        );
        return json(res, { revoked: true });
      }
      const q = await pool.query(
        `select t.id,t.user_id,coalesce(p.plan,'free') as plan from axiom_cli_tokens t
        left join axiom_profiles p on p.user_id=t.user_id
        where t.token_hash=$1 and t.revoked_at is null and t.expires_at>now()`,
        [hash(m[1])],
      );
      if (!q.rowCount) return fail(res, 401, "Token invalid or expired");
      const row = q.rows[0];
      await pool.query(
        "update axiom_cli_tokens set last_used_at=now() where id=$1",
        [row.id],
      );
      return json(res, {
        authenticated: true,
        plan: row.plan,
        userId: row.user_id,
        tokenId: row.id,
      });
    } catch (e) {
      console.error("cli_token_operation_failed", {
        code: e?.code ?? "unexpected",
      });
      return fail(res, 503, "Service temporarily unavailable");
    }
  };
}
export function accountTokensHandler(pool, auth) {
  return async (req, res) => {
    if (options(req, res)) return;
    if (!cors(req, res)) return fail(res, 403, "Origin not permitted");
    const revoke = req.method === "POST" && req.query?.action === "revoke";
    if (req.method !== "GET" && !revoke)
      return fail(res, 405, "Method not allowed");
    try {
      const session = await auth.api.getSession({
        headers: toHeaders(req.headers),
      });
      if (!session?.user?.id)
        return fail(res, 401, "Sign in to manage CLI tokens");
      const userId = session.user.id;
      if (revoke) {
        let body;
        try {
          body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        } catch {
          return fail(res, 400, "Invalid JSON");
        }
        const id = body?.tokenId;
        if (
          typeof id !== "string" ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
            id,
          )
        )
          return fail(res, 400, "Invalid token id");
        const q = await pool.query(
          "update axiom_cli_tokens set revoked_at=coalesce(revoked_at,now()) where id=$1 and user_id=$2 returning id",
          [id, userId],
        );
        if (!q.rowCount) return fail(res, 404, "Token not found");
        return json(res, { revoked: true });
      }
      const q = await pool.query(
        "select id,created_at,last_used_at,expires_at,revoked_at from axiom_cli_tokens where user_id=$1 order by created_at desc limit 100",
        [userId],
      );
      return json(res, { tokens: q.rows });
    } catch (e) {
      console.error("account_tokens_failed", { code: e?.code ?? "unexpected" });
      return fail(res, 503, "Service temporarily unavailable");
    }
  };
}
