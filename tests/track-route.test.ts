import trackApp from '../src/routes/track';

describe('Track Conversion Route Handler', () => {
  const mockPrepared = {
    bind: jest.fn().mockReturnThis(),
    first: jest.fn(),
    run: jest.fn().mockResolvedValue({ success: true }),
    all: jest.fn().mockResolvedValue({ results: [] }),
  };

  const mockDB = {
    prepare: jest.fn().mockReturnValue(mockPrepared),
  };

  const mockKV = {
    get: jest.fn().mockResolvedValue(null),
    put: jest.fn().mockResolvedValue(undefined),
  };

  const mockBindings = {
    DB: mockDB,
    URL_KV: mockKV,
    FRONTEND_API_SECRET: 'secret_test_123',
    SHORT_DOMAINS: {} as any,
    ANALYTICS_QUEUE: {} as any,
  };

  const mockExecutionContext = {
    waitUntil: jest.fn(),
    passThroughOnException: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should validate and insert conversion with full customer metadata into D1', async () => {
    // 1. Mock finding the user in DB (users table) & link
    mockPrepared.first
      .mockResolvedValueOnce({ id: 'usr_owner_1', plan: 'PRO' }) // user query in authMiddleware
      .mockResolvedValueOnce({ id: 'lnk_123', user_id: 'usr_owner_1' }); // link query in track route

    const body = {
      eventName: 'checkout_completed',
      amount: 199.99,
      currency: 'USD',
      customer: {
        id: 'cust_abc_99',
        fullName: 'Samuel KONVELBO',
        email: 'samuel@konvelbo.dev',
        avatarUrl: 'https://cdn.lsho.cc/avatars/samuel.png',
      },
      linkId: 'lnk_123',
      clickId: 'clk_xyz_456',
    };

    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Frontend-Secret': 'secret_test_123',
        'X-User-Id': 'usr_owner_1',
        'X-User-Plan': 'PRO',
      },
      body: JSON.stringify(body),
    });

    const res = await trackApp.fetch(req, mockBindings as any, mockExecutionContext as any);
    expect(res.status).toBe(201);

    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.data.customerName).toBe('Samuel KONVELBO');
    expect(json.data.customerEmail).toBe('samuel@konvelbo.dev');
    expect(json.data.customerAvatar).toBe('https://cdn.lsho.cc/avatars/samuel.png');
    expect(json.data.amount).toBe(199.99);
    expect(json.data.currency).toBe('USD');

    // Verify D1 calls
    expect(mockDB.prepare).toHaveBeenCalled();
  });

  it('should reject requests with invalid link or unauthorized user', async () => {
    mockPrepared.first
      .mockResolvedValueOnce({ id: 'usr_owner_1', plan: 'PRO' }) // user query
      .mockResolvedValueOnce({ id: 'lnk_123', user_id: 'usr_different_user' }); // link query

    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Frontend-Secret': 'secret_test_123',
        'X-User-Id': 'usr_owner_1',
      },
      body: JSON.stringify({
        eventName: 'lead',
        linkId: 'lnk_123',
      }),
    });

    const res = await trackApp.fetch(req, mockBindings as any, mockExecutionContext as any);
    expect(res.status).toBe(403);
    const json = await res.json() as any;
    expect(json.success).toBe(false);
    expect(json.code).toBe('FORBIDDEN');
  });
});
