import { describe, it, expect } from 'vitest';
import {
  LTV,
  PROTOCOL_FEE_BPS,
  MAX_SLIPPAGE_BPS,
  DEFAULT_SLIPPAGE_BPS,
} from '../constants/protocol';

describe('Protocol Constants', () => {
  describe('LTV thresholds', () => {
    it('WARNING < MAX < LIQUIDATION', () => {
      expect(LTV.WARNING).toBeLessThan(LTV.MAX);
      expect(LTV.MAX).toBeLessThan(LTV.LIQUIDATION);
    });

    it('WARNING is between 0 and 1', () => {
      expect(LTV.WARNING).toBeGreaterThan(0);
      expect(LTV.WARNING).toBeLessThan(1);
    });

    it('MAX is between 0 and 1', () => {
      expect(LTV.MAX).toBeGreaterThan(0);
      expect(LTV.MAX).toBeLessThan(1);
    });

    it('LIQUIDATION is between 0 and 1', () => {
      expect(LTV.LIQUIDATION).toBeGreaterThan(0);
      expect(LTV.LIQUIDATION).toBeLessThan(1);
    });

    it('WARNING is at least 50%', () => {
      expect(LTV.WARNING).toBeGreaterThanOrEqual(0.5);
    });

    it('LIQUIDATION does not exceed 95%', () => {
      expect(LTV.LIQUIDATION).toBeLessThanOrEqual(0.95);
    });
  });

  describe('Protocol fee', () => {
    it('PROTOCOL_FEE_BPS is reasonable (< 1000 bps / 10%)', () => {
      expect(PROTOCOL_FEE_BPS).toBeLessThan(1000);
    });

    it('PROTOCOL_FEE_BPS is non-negative', () => {
      expect(PROTOCOL_FEE_BPS).toBeGreaterThanOrEqual(0);
    });

    it('PROTOCOL_FEE_BPS equals 30 (0.3%)', () => {
      expect(PROTOCOL_FEE_BPS).toBe(30);
    });
  });

  describe('Slippage limits', () => {
    it('DEFAULT_SLIPPAGE_BPS is less than MAX_SLIPPAGE_BPS', () => {
      expect(DEFAULT_SLIPPAGE_BPS).toBeLessThan(MAX_SLIPPAGE_BPS);
    });

    it('MAX_SLIPPAGE_BPS is reasonable (< 2000 bps / 20%)', () => {
      expect(MAX_SLIPPAGE_BPS).toBeLessThan(2000);
    });

    it('DEFAULT_SLIPPAGE_BPS is reasonable (< 500 bps / 5%)', () => {
      expect(DEFAULT_SLIPPAGE_BPS).toBeLessThanOrEqual(500);
    });

    it('DEFAULT_SLIPPAGE_BPS is non-negative', () => {
      expect(DEFAULT_SLIPPAGE_BPS).toBeGreaterThanOrEqual(0);
    });

    it('MAX_SLIPPAGE_BPS is non-negative', () => {
      expect(MAX_SLIPPAGE_BPS).toBeGreaterThanOrEqual(0);
    });
  });
});
