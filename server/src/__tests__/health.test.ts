import request from 'supertest';
import { app } from '../app';
import { aiClient } from '../clients/aiClient';
import { prisma } from '../lib/prisma';

jest.mock('../clients/aiClient', () => ({
  aiClient: {
    get: jest.fn(),
  }
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  }
}));

describe('GET /api/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 OK and status of all services when healthy', async () => {
    (aiClient.get as jest.Mock).mockResolvedValue({ data: { status: 'ok' } });
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);

    const response = await request(app).get('/api/health');
    
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      status: 'ok',
      services: {
        api: 'ok',
        db: 'ok',
        ai: 'ok'
      }
    }));
  });

  it('should return degraded if AI service is down', async () => {
    (aiClient.get as jest.Mock).mockRejectedValue(new Error('Network Error'));
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);

    const response = await request(app).get('/api/health');
    
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('degraded');
    expect(response.body.services.ai).toBe('down');
  });

  it('should return degraded if DB is down', async () => {
    (aiClient.get as jest.Mock).mockResolvedValue({ data: { status: 'ok' } });
    (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('DB Connection Refused'));

    const response = await request(app).get('/api/health');
    
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('degraded');
    expect(response.body.services.db).toBe('down');
  });
});
