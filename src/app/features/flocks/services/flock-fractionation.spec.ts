import { FractionationDraft } from '../interfaces/flock-fractionation.interface';
import { fractionationFixture, fractionationFlock } from '../testing/fractionation-fixture';
import { buildFractionation, fractionationTargets, validateFractionation } from './flock-fractionation';

const draft = (overrides: Partial<FractionationDraft> = {}): FractionationDraft => ({
  kind: 'partial', destination: 'empty', target: '2', quantity: '40', code: 'l-024-b', occurredAt: '', reason: '', ...overrides,
});

describe('fractionation policy', () => {
  it('offers houses without birds including historic finalized and open zero-bird lots, ignoring capacity and stale occupancy', () => {
    expect(fractionationTargets(fractionationFixture(), 'empty').map((target) => target.value)).toEqual(['2', '3', '4']);
  });
  it('offers houses with open compatible lots, even with zero birds or exceeded capacity, excluding the original and other UPs', () => {
    expect(fractionationTargets(fractionationFixture(), 'existing').map((target) => target.value)).toEqual(['zero', 'receiver']);
  });
  it('does not treat a house with living birds as empty merely because another lot there is finalized', () => {
    const context = fractionationFixture();
    context.flocks.push(fractionationFlock({ id: 'still-open', poultry_house_id: 3 }));
    expect(fractionationTargets(context, 'empty').map((target) => target.value)).not.toContain('3');
  });
  it.each([
    [draft(), { version: 2, quantity: 40, destination_poultry_house_id: 2, destination_code: 'L-024-B' }],
    [draft({ kind: 'total' }), { version: 2, quantity: 120, destination_poultry_house_id: 2 }],
    [draft({ destination: 'existing', target: 'receiver' }), { version: 2, quantity: 40, destination_flock_id: 'receiver', destination_version: 8 }],
    [draft({ kind: 'total', destination: 'existing', target: 'receiver' }), { version: 2, quantity: 120, destination_flock_id: 'receiver', destination_version: 8 }],
  ])('builds only the fields for the chosen combination: %j', (value, request) => {
    expect(buildFractionation(value, fractionationFixture())).toEqual(request);
  });
  it.each(['0', '-1', '1.5', '120', '121', '9007199254740992', 'abc'])('rejects invalid partial quantities %s', (quantity) => {
    expect(validateFractionation(draft({ quantity }), fractionationFixture()).quantity).toBeTruthy();
  });
  it('rejects forged destinations and future dates, but does not impose capacity', () => {
    expect(validateFractionation(draft({ destination: 'existing', target: 'foreign' }), fractionationFixture()).target).toBeTruthy();
    expect(validateFractionation(draft({ occurredAt: '2030-01-01T00:00' }), fractionationFixture(), Date.parse('2026-10-29')).occurredAt).toBeTruthy();
    expect(validateFractionation(draft(), fractionationFixture())).toEqual({});
  });
  it('trims optional reasons and omits incompatible hidden fields', () => {
    expect(buildFractionation(draft({ destination: 'existing', target: 'receiver', code: '!!!', reason: '  Traslado  ' }), fractionationFixture()))
      .toEqual({ version: 2, quantity: 40, destination_flock_id: 'receiver', destination_version: 8, reason: 'Traslado' });
  });
});
