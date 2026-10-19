import test from "node:test";
import assert from "node:assert/strict";
import { cliHandler, accountTokensHandler } from "../lib/cli-tokens.js";
function res() {
  return {
    statusCode: 0,
    setHeader() {},
    end(text) {
      this.body = JSON.parse(text || "null");
    },
  };
}
const token = "axiom_cli_" + "A".repeat(43),
  id = "12345678-1234-1234-1234-123456789abc";
test("self-revocation hashes credential and ignores arbitrary token ID", async () => {
  const calls = [];
  const handler = cliHandler({
    query: async (sql, args) => {
      calls.push({ sql, args });
      return { rowCount: 1, rows: [] };
    },
  });
  const r = res();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer " + token },
      query: { action: "revoke" },
      body: { tokenId: "other" },
    },
    r,
  );
  assert.equal(r.statusCode, 200);
  assert.match(calls[0].sql, /where token_hash=\$1/);
  assert.match(calls[0].args[0], /^[0-9a-f]{64}$/);
});
test("account revocation is scoped to authenticated owner", async () => {
  let params;
  const handler = accountTokensHandler(
    {
      query: async (sql, args) => {
        assert.match(sql, /and user_id=\$2/);
        params = args;
        return { rowCount: 0, rows: [] };
      },
    },
    { api: { getSession: async () => ({ user: { id: "owner" } }) } },
  );
  const r = res();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer browser" },
      query: { action: "revoke" },
      body: { tokenId: id },
    },
    r,
  );
  assert.equal(r.statusCode, 404);
  assert.deepEqual(params, [id, "owner"]);
});
test("unauthenticated account listing never queries database", async () => {
  const handler = accountTokensHandler(
    { query: async () => assert.fail("must not query") },
    { api: { getSession: async () => null } },
  );
  const r = res();
  await handler({ method: "GET", headers: {} }, r);
  assert.equal(r.statusCode, 401);
});
test("revoked or expired token cannot authenticate", async () => {
  const handler = cliHandler({
    query: async (sql) => {
      assert.match(sql, /revoked_at is null and t.expires_at>now\(\)/);
      return { rowCount: 0, rows: [] };
    },
  });
  const r = res();
  await handler(
    { method: "GET", headers: { authorization: "Bearer " + token } },
    r,
  );
  assert.equal(r.statusCode, 401);
});
