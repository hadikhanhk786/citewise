import request from 'supertest';
import { app } from '../app';
import { aiClient } from '../clients/aiClient';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';

jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../clients/aiClient', () => ({ aiClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));
jest.mock('../lib/prisma', () => ({
  prisma: { user: { findUnique: jest.fn() }, $transaction: jest.fn() },
}));

const asRole = (role: string) => {
  (jwt.verify as jest.Mock).mockReturnValue({ userId: 'u1', role });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1', email: 'a@example.com', role });
};
const auth = (r: request.Test) => r.set('Authorization', 'Bearer t');

describe('/api/library (admin only)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403 for a non-admin on every route', async () => {
    asRole('MEMBER');
    expect((await auth(request(app).post('/api/library')).field('url', 'https://x.dev')).status).toBe(403);
    expect((await auth(request(app).get('/api/library'))).status).toBe(403);
    expect((await auth(request(app).delete('/api/library/lib:user:a'))).status).toBe(403);
    expect(aiClient.post).not.toHaveBeenCalled();
  });

  it('422 when neither a file nor a link is sent', async () => {
    asRole('ADMIN');
    const res = await auth(request(app).post('/api/library')).field('title', 'x');
    expect(res.status).toBe(422);
    expect(aiClient.post).not.toHaveBeenCalled();
  });

  it('proxies a link to the RAG service', async () => {
    asRole('ADMIN');
    (aiClient.post as jest.Mock).mockResolvedValue({ data: { sourceId: 'lib:user:x', title: 'X', chunks: 3 } });
    const res = await auth(request(app).post('/api/library')).field('url', 'https://x.dev/a');
    expect(res.status).toBe(201);
    expect(res.body.chunks).toBe(3);
    expect((aiClient.post as jest.Mock).mock.calls[0][0]).toBe('/library/add');
  });

  it('rejects an unsupported file type', async () => {
    asRole('ADMIN');
    const res = await auth(request(app).post('/api/library')).attach('file', Buffer.from('MZ'), 'a.exe');
    expect(res.status).toBe(400);
  });

  it('lists and deletes items', async () => {
    asRole('ADMIN');
    (aiClient.get as jest.Mock).mockResolvedValue({ data: [{ sourceId: 'lib:user:a', chunks: 2 }] });
    (aiClient.delete as jest.Mock).mockResolvedValue({ data: { deleted: 'lib:user:a' } });
    expect((await auth(request(app).get('/api/library'))).body).toHaveLength(1);
    expect((await auth(request(app).delete('/api/library/lib:user:a'))).status).toBe(200);
    expect(aiClient.delete).toHaveBeenCalledWith('/library/items/lib%3Auser%3Aa');
  });
});
