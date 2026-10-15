
import { describe, it, expect } from 'vitest';
import app from './index';

const MOCK_ENV = {
  ALLOWED_ORIGINS: 'http://localhost',
  FRONTEND_API_SECRET: 'test_secret',
  DB: {
    prepare: () => ({
      bind: () => ({
        first: async () => null,
        run: async () => ({ meta: { changes: 0 } }),
        all: async () => ({ results: [] })
      })
    })
  }
};

describe('API Security and Functionality Tests', () => {
  it('should reject unauthorized access to /api/v1/users/me', async () => {
    const res = await app.request('/api/v1/users/me', {
      headers: {
        'Authorization': 'Bearer invalid_token'
      }
    }, MOCK_ENV);
    expect(res.status).toBe(401);
  });

  it('should return 401 for /api/v1/analytics without token', async () => {
    const res = await app.request('/api/v1/analytics', {}, MOCK_ENV);
    expect(res.status).toBe(401);
  });
});

