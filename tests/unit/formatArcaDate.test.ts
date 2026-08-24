import { describe, it, expect } from 'vitest';
import {
  formatArcaDate,
  formatArcaDateOnly,
  formatArcaTimestamp,
} from '../../src/utils/formatArcaDate';

describe('formatArcaDate utils', () => {
  describe('formatArcaDateOnly — fechas-calendario (literales)', () => {
    // Estos casos son la regresión que motivó ArcaDateInput: un día calendario
    // no debe desplazarse a UTC-3, porque el usuario ya expresó qué día quiere.
    it.each([
      ['2026-08-24', '20260824'],
      ['20260824', '20260824'],
      ['2026-01-05', '20260105'],
      [' 2026-08-24 ', '20260824'],
    ])('should take the string %s literally', (input, expected) => {
      expect(formatArcaDateOnly(input)).toBe(expected);
    });

    it.each([
      ["new Date('2026-08-24')", new Date('2026-08-24')],
      ["new Date('2026-08-24T00:00:00Z')", new Date('2026-08-24T00:00:00Z')],
      ['new Date(Date.UTC(2026, 7, 24))', new Date(Date.UTC(2026, 7, 24))],
    ])('should treat exact UTC midnight as a calendar date (%s)', (_label, input) => {
      expect(formatArcaDateOnly(input)).toBe('20260824');
    });

    it('should reject an unparseable string', () => {
      expect(() => formatArcaDateOnly('24/08/2026')).toThrow(RangeError);
      expect(() => formatArcaDateOnly('ayer')).toThrow(RangeError);
    });

    it('should reject a date that does not exist', () => {
      expect(() => formatArcaDateOnly('2026-02-30')).toThrow(RangeError);
      expect(() => formatArcaDateOnly('2026-13-01')).toThrow(RangeError);
    });

    it('should reject an invalid Date', () => {
      expect(() => formatArcaDateOnly(new Date('no-es-fecha'))).toThrow(RangeError);
    });
  });

  describe('formatArcaDateOnly — instantes (convertidos a UTC-3)', () => {
    it('should format a midday date', () => {
      expect(formatArcaDateOnly(new Date('2026-08-24T15:00:00Z'))).toBe('20260824');
    });

    it('should return the Argentine day, not the UTC day, late at night', () => {
      // 22:00 del 24/08 en Argentina es 01:00 UTC del 25/08
      expect(formatArcaDateOnly(new Date('2026-08-25T01:00:00Z'))).toBe('20260824');
    });

    it('should handle the exact UTC-3 midnight boundary', () => {
      // 00:00:00 del 25/08 en Argentina == 03:00:00 UTC del 25/08
      expect(formatArcaDateOnly(new Date('2026-08-25T03:00:00Z'))).toBe('20260825');
      // Un segundo antes sigue siendo el 24
      expect(formatArcaDateOnly(new Date('2026-08-25T02:59:59Z'))).toBe('20260824');
    });

    it('should always return 8 characters', () => {
      expect(formatArcaDateOnly(new Date('2026-01-05T12:00:00Z'))).toBe('20260105');
      expect(formatArcaDateOnly(new Date('2026-01-05T12:00:00Z'))).toHaveLength(8);
    });
  });

  describe('formatArcaTimestamp (yyyymmddhhmmss)', () => {
    it('should format date and time in Argentine local time', () => {
      expect(formatArcaTimestamp(new Date('2026-08-25T01:35:07Z'))).toBe('20260824223507');
    });

    it('should treat a Date as an instant even at exact UTC midnight', () => {
      // A diferencia de formatArcaDateOnly, acá la hora es el dato que ARCA valida,
      // así que no se aplica la heurística de fecha-calendario.
      expect(formatArcaTimestamp(new Date('2026-08-24T00:00:00Z'))).toBe('20260823210000');
    });

    it('should pad a calendar-date string with 000000', () => {
      expect(formatArcaTimestamp('2026-08-24')).toBe('20260824000000');
      expect(formatArcaTimestamp('20260824')).toBe('20260824000000');
    });

    it('should zero-pad every component', () => {
      expect(formatArcaTimestamp(new Date('2026-01-05T06:07:08Z'))).toBe('20260105030708');
    });

    it('should always return 14 characters', () => {
      expect(formatArcaTimestamp(new Date('2026-08-24T15:00:00Z'))).toHaveLength(14);
    });

    it('should agree with formatArcaDateOnly on the date portion for real instants', () => {
      const instantes = [
        new Date('2026-08-25T02:30:00Z'),
        new Date('2026-08-24T15:00:00Z'),
        new Date('2026-08-25T01:35:07Z'),
        new Date('2026-01-01T04:00:00Z'),
      ];

      for (const d of instantes) {
        expect(formatArcaTimestamp(d).slice(0, 8)).toBe(formatArcaDateOnly(d));
      }
    });

    it('should agree with formatArcaDateOnly for calendar-date strings', () => {
      for (const s of ['2026-08-24', '20260824', '2026-01-05']) {
        expect(formatArcaTimestamp(s).slice(0, 8)).toBe(formatArcaDateOnly(s));
      }
    });
  });

  describe('formatArcaDate (ISO 8601 con offset)', () => {
    it('should keep the existing WSAA format', () => {
      expect(formatArcaDate(new Date('2026-08-25T01:35:07Z'))).toBe('2026-08-24T22:35:07-03:00');
    });

    it('should agree with the compact formats', () => {
      const d = new Date('2026-08-25T01:35:07Z');
      const iso = formatArcaDate(d).replace(/[-:]/g, '').replace('T', '').slice(0, 14);
      expect(iso).toBe(formatArcaTimestamp(d));
    });
  });
});
