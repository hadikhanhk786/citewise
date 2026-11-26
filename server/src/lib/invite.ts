import crypto from 'crypto';
import { env } from '../config/env';

// Invite-only sign-up: a token is {email, expiry} signed with a key derived from JWT_SECRET,
// so invites need no database table and can't be forged or reused for another address.
const key = () => crypto.createHash('sha256').update(`invite:${env.JWT_SECRET}`).digest();
const sign = (payload: string) => crypto.createHmac('sha256', key()).update(payload).digest('base64url');

export function createInvite(email: string, days = 7, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ e: email.trim().toLowerCase(), x: now + days * 86_400_000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function inviteMatches(token: string, email: string, now = Date.now()): boolean {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return e === email.trim().toLowerCase() && typeof x === 'number' && x > now;
  } catch {
    return false;
  }
}
