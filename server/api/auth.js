import { toNodeHandler } from 'better-auth/node';
import { auth } from '../lib/auth.js';
import { cors, options, fail } from '../lib/http.js';

const handle = toNodeHandler(auth);

export default async function handler(req, res) {
  if (options(req, res)) return;
  if (!cors(req, res)) return fail(res, 403, 'Origin not permitted');
  // Do not log request bodies, cookies, passwords or auth headers.
  return handle(req, res);
}
