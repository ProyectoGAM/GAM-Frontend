import { formatDeliveryMoney } from './delivery-money';

describe('formatDeliveryMoney', () => {
  it('preserves third decimals and large integer digits exactly', () => {
    expect(formatDeliveryMoney('12.625')).toContain('12,625');
    expect(formatDeliveryMoney('9007199254740993.125')).toContain('9.007.199.254.740.993,125');
  });

  it('distinguishes unknown historical prices from a genuine zero', () => {
    expect(formatDeliveryMoney(null)).toBe('Sin detalle de precios');
    expect(formatDeliveryMoney('0.000')).toContain('0');
    expect(formatDeliveryMoney('0.000')).not.toContain('Sin detalle');
  });
});
