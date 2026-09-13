import { LShorter, QuickLink, QuickLinkError } from '../src/sdk';

// Mock global fetch
const originalFetch = global.fetch;

describe('LShorter / QuickLink TypeScript SDK', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('should initialize SDK with apiKey and baseUrl', () => {
    const client = new QuickLink({
      apiKey: 'sk_live_test_123456',
      baseUrl: 'https://custom-api.lsho.cc',
    });

    expect(client.track).toBeDefined();
    expect(client.links).toBeDefined();
    expect(client.analytics).toBeDefined();
    expect(client.users).toBeDefined();
    expect(client.domains).toBeDefined();
  });

  it('should send conversion payload with customer details (fullName, email, avatarUrl)', async () => {
    const mockResponse = {
      success: true,
      data: {
        id: 'evt_conv_001',
        eventName: 'purchase',
        amount: 120.5,
        currency: 'EUR',
        customerId: 'usr_buyer_99',
        customerEmail: 'samuel@konvelbo.dev',
        customerName: 'Samuel KONVELBO',
        customerAvatar: 'https://cdn.lsho.cc/avatars/samuel.png',
        avatarUrl: 'https://cdn.lsho.cc/avatars/samuel.png',
        linkId: 'lnk_ecommerce_42',
        clickId: 'clk_live_88',
        plan: 'PRO',
        created_at: '2026-09-13T10:00:00.000Z',
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockResponse,
    } as any);

    const client = new LShorter({ apiKey: 'sk_live_sample_key' });

    const result = await client.track.conversion({
      eventName: 'purchase',
      amount: 120.5,
      currency: 'EUR',
      customer: {
        id: 'usr_buyer_99',
        email: 'samuel@konvelbo.dev',
        fullName: 'Samuel KONVELBO',
        avatarUrl: 'https://cdn.lsho.cc/avatars/samuel.png',
      },
      linkId: 'lnk_ecommerce_42',
      clickId: 'clk_live_88',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchInit] = (global.fetch as jest.Mock).mock.calls[0];

    expect(fetchUrl).toBe('https://api.lsho.cc/api/v1/track');
    expect(fetchInit.method).toBe('POST');
    expect(fetchInit.headers['Authorization']).toBe('Bearer sk_live_sample_key');
    expect(fetchInit.headers['Content-Type']).toBe('application/json');

    const sentBody = JSON.parse(fetchInit.body);
    expect(sentBody).toMatchObject({
      eventName: 'purchase',
      amount: 120.5,
      currency: 'EUR',
      customerId: 'usr_buyer_99',
      customerEmail: 'samuel@konvelbo.dev',
      customerName: 'Samuel KONVELBO',
      customerAvatar: 'https://cdn.lsho.cc/avatars/samuel.png',
      linkId: 'lnk_ecommerce_42',
      clickId: 'clk_live_88',
    });

    expect(result.id).toBe('evt_conv_001');
    expect(result.customerName).toBe('Samuel KONVELBO');
    expect(result.customerAvatar).toBe('https://cdn.lsho.cc/avatars/samuel.png');
  });

  it('should throw QuickLinkError on API failure response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        success: false,
        error: 'Link not found',
        code: 'LINK_NOT_FOUND',
      }),
    } as any);

    const client = new QuickLink({ apiKey: 'sk_live_test' });

    await expect(
      client.track.conversion({
        eventName: 'lead',
        linkId: 'lnk_non_existent',
      })
    ).rejects.toThrow(QuickLinkError);
  });

  it('should get user profile via sdk.users.me', async () => {
    const mockUser = {
      success: true,
      data: {
        id: 'usr_123',
        email: 'dev@lsho.cc',
        name: 'Samuel KONVELBO',
        fullName: 'Samuel KONVELBO',
        avatarUrl: 'https://cdn.lsho.cc/avatar.png',
        plan: 'PRO',
        clicksThisMonth: 540,
        clicksLimit: 100000,
        linksCount: 15,
        domainsCount: 2,
        created_at: '2026-01-01T00:00:00Z',
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockUser,
    } as any);

    const client = new QuickLink({ apiKey: 'sk_live_123' });
    const user = await client.users.me();

    expect(user.email).toBe('dev@lsho.cc');
    expect(user.fullName).toBe('Samuel KONVELBO');
    expect(user.avatarUrl).toBe('https://cdn.lsho.cc/avatar.png');
    expect(user.plan).toBe('PRO');
  });
});
