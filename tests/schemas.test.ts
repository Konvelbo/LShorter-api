import { TrackConversionSchema, CreateUserSchema, CreateLinkSchema } from '../src/lib/schemas';

describe('API Validation Schemas', () => {
  describe('TrackConversionSchema', () => {
    it('should validate standard conversion payload with customer details', () => {
      const input = {
        eventName: 'purchase',
        amount: 89.99,
        currency: 'EUR',
        customer: {
          id: 'usr_cust_123',
          email: 'alice.dupont@example.com',
          name: 'Alice Dupont',
          fullName: 'Alice Dupont',
          avatarUrl: 'https://cdn.example.com/avatars/alice.jpg',
        },
        linkId: 'lnk_summer2026',
        clickId: 'clk_xyz987',
      };

      const result = TrackConversionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eventName).toBe('purchase');
        expect(result.data.amount).toBe(89.99);
        expect(result.data.currency).toBe('EUR');
        expect(result.data.customer?.email).toBe('alice.dupont@example.com');
        expect(result.data.customer?.fullName).toBe('Alice Dupont');
        expect(result.data.customer?.avatarUrl).toBe('https://cdn.example.com/avatars/alice.jpg');
      }
    });

    it('should support flat customer fields and aliases', () => {
      const input = {
        eventName: 'subscription',
        amount: 29.0,
        currency: 'usd',
        customerId: 'usr_bob_456',
        customerEmail: 'bob.martin@example.com',
        customerFullName: 'Bob Martin',
        customerAvatar: 'https://cdn.example.com/avatars/bob.png',
        linkId: 'lnk_pro_plan',
      };

      const result = TrackConversionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('USD'); // auto-uppercased
        expect(result.data.customerEmail).toBe('bob.martin@example.com');
        expect(result.data.customerFullName).toBe('Bob Martin');
        expect(result.data.customerAvatar).toBe('https://cdn.example.com/avatars/bob.png');
      }
    });

    it('should fallback to default amount 0 and EUR currency', () => {
      const input = {
        eventName: 'lead',
        linkId: 'lnk_lead_1',
      };

      const result = TrackConversionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amount).toBe(0);
        expect(result.data.currency).toBe('EUR');
      }
    });

    it('should fail when linkId or eventName is missing', () => {
      const missingLink = { eventName: 'click' };
      const missingEvent = { linkId: 'lnk_123' };

      expect(TrackConversionSchema.safeParse(missingLink).success).toBe(false);
      expect(TrackConversionSchema.safeParse(missingEvent).success).toBe(false);
    });
  });

  describe('CreateUserSchema', () => {
    it('should accept valid email, name, and plan', () => {
      const input = {
        email: 'dev@lsho.cc',
        name: 'Samuel Konvelbo',
        plan: 'PRO',
      };

      const result = CreateUserSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('dev@lsho.cc');
        expect(result.data.name).toBe('Samuel Konvelbo');
        expect(result.data.plan).toBe('PRO');
      }
    });

    it('should reject invalid email format', () => {
      const input = {
        email: 'not-an-email',
      };

      const result = CreateUserSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
