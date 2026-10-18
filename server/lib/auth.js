import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import pg from 'pg';
import { sanitizeOrigin } from './http.js';

const required = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const webOrigin = sanitizeOrigin(required('WEB_ORIGIN'));
const apiOrigin = sanitizeOrigin(required('BETTER_AUTH_URL'));
required('BETTER_AUTH_SECRET');
const connectionString = required('DATABASE_URL');

export const pool = new pg.Pool({
  connectionString,
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 8_000,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: true }
});

async function sendPasswordResetEmail({ user, url }) {
  const key = required('RESEND_API_KEY');
  const sender = required('EMAIL_FROM');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: sender,
      to: [user.email],
      subject: 'AxiomPilotCode password reset',
      text: `A password reset was requested for your AxiomPilotCode account. Open this link to reset your password: ${url}\n\nIf you did not request it, ignore this message.`
    })
  });
  if (!response.ok) throw new Error('Password reset email delivery failed');
}

export const auth = betterAuth({
  appName: 'AxiomPilotCode',
  baseURL: apiOrigin,
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  trustedOrigins: [webOrigin],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,
    minPasswordLength: 10,
    sendResetPassword: sendPasswordResetEmail,
    revokeSessionsOnPasswordReset: true
  },
  plugins: [bearer()],
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, window: 60, max: 20 }
});
