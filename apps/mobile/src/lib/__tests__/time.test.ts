import { localHourToUtc, utcHourToLocal } from '../time';

describe('reminder hour conversion', () => {
  it('converts between local and UTC hours across offsets', () => {
    // US Central (UTC-6): offset +360 minutes
    expect(localHourToUtc(19, 360)).toBe(1);
    expect(utcHourToLocal(1, 360)).toBe(19);
    // UTC+5:30 rounds down to the hour
    expect(localHourToUtc(9, -330)).toBe(3);
    expect(localHourToUtc(0, 0)).toBe(0);
    for (let h = 0; h < 24; h++) expect(utcHourToLocal(localHourToUtc(h, 300), 300)).toBe(h);
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2025-03-10T12:00:00Z');
  it('compacts recent times', () => {
    const { relativeTime } = jest.requireActual('../time') as typeof import('../time');
    expect(relativeTime('2025-03-10T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2025-03-10T11:15:00Z', now)).toBe('45m');
    expect(relativeTime('2025-03-10T07:00:00Z', now)).toBe('5h');
  });
});
