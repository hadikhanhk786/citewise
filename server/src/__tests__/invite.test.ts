import request from 'supertest';
import { app } from '../app';
import { createInvite, inviteMatches } from '../lib/invite';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';

jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));

jest.mock('../clients/aiClient', () => ({ aiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../lib/prisma', () => ({
  prisma: { user: { findUnique: jest.fn() }, $transaction: jest.fn() },
}));

describe('invite tokens', () => {
  const now = Date.UTC(2026, 10, 26);

  it('accepts the invited email (case-insensitive) before expiry', () => {
    const token = createInvite('Friend@Example.com', 7, now);
    expect(inviteMatches(token, 'friend@example.com', now + 1000)).toBe(true);
  });

  it('rejects another email, an expired invite and a tampered token', () => {
    const token = createInvite('friend@example.com', 7, now);
    expect(inviteMatches(token, 'someone@example.com', now)).toBe(false);
    expect(inviteMatches(token, 'friend@example.com', now + 8 * 86_400_000)).toBe(false);
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ e: 'friend@example.com', x: now * 2 })).toString('base64url');
    expect(inviteMatches(`${forged}.${sig}`, 'friend@example.com', now)).toBe(false);
    expect(inviteMatches(payload, 'friend@example.com', now)).toBe(false);
  });
});

describe('POST /api/auth/register is invite-only', () => {
  const body = { email: 'new@example.com', password: 'longpassword', name: 'New User' };

  it('rejects sign-up without an invite (validation)', async () => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(422);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an invite issued for someone else', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ ...body, invite: createInvite('other@example.com') });
    expect(res.status).toBe(403);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/invites (admin only)', () => {
  const asRole = (role: string) => {
    (jwt.verify as jest.Mock).mockReturnValue({ userId: 'u1', role });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1', email: 'a@example.com', role });
  };
  const send = (body: object) => request(app).post('/api/auth/invites').set('Authorization', 'Bearer t').send(body);

  it('403 for a non-admin', async () => {
    asRole('MEMBER');
    expect((await send({ email: 'f@example.com' })).status).toBe(403);
  });

  it('422 for a bad email', async () => {
    asRole('ADMIN');
    expect((await send({ email: 'nope' })).status).toBe(422);
  });

  it('returns a link whose token verifies for that email', async () => {
    asRole('ADMIN');
    const res = await send({ email: 'Friend@Example.com', days: 3 });
    expect(res.status).toBe(201);
    const url = new URL(res.body.link);
    expect(url.searchParams.get('email')).toBe('friend@example.com');
    expect(inviteMatches(url.searchParams.get('invite')!, 'friend@example.com')).toBe(true);
  });
});
