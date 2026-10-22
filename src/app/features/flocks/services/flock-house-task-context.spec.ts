import { convertToParamMap } from '@angular/router';

import { parseFlockHouseOrigin } from './flock-house-task-context';

describe('house task origin', () => {
  it('accepts the existing house origin convention', () => {
    expect(parseFlockHouseOrigin(convertToParamMap({ lotFrom: 'house', unitId: '7', houseId: '22' })))
      .toEqual({ unitId: 7, houseId: 22 });
  });

  it.each([
    {}, { lotFrom: 'external', unitId: '7', houseId: '22' },
    { lotFrom: 'house', unitId: '0', houseId: '22' },
    { lotFrom: 'house', unitId: '7', houseId: '-1' },
    { lotFrom: 'house', unitId: '7', houseId: 'https://example.com' },
    { lotFrom: 'house', unitId: '9007199254740992', houseId: '22' },
  ])('rejects an invalid origin %j', (params) => {
    expect(parseFlockHouseOrigin(convertToParamMap(params))).toBeNull();
  });
});
