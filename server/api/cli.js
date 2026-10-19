import { pool } from '../lib/auth.js';
import { cliHandler } from '../lib/cli-tokens.js';
export default cliHandler(pool);
