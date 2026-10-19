import { pool, auth } from '../lib/auth.js';
import { accountTokensHandler } from '../lib/cli-tokens.js';
export default accountTokensHandler(pool, auth);
