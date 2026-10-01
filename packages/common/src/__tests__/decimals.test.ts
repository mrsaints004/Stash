import { describe, it, expect } from 'vitest';
import {
  usdcToNative,
  usdcToErc20,
  parseUnits,
  formatUnits,
  parseUsdcErc20,
  parseUsdcNative,
  formatUsdcErc20,
  formatUsdcNative,
  DECIMAL_DIFFERENCE,
} from '../utils/decimals';

describe('USDC Decimal Conversions', () => {
  it('DECIMAL_DIFFERENCE is 10^12', () => {
    expect(DECIMAL_DIFFERENCE).toBe(1_000_000_000_000n);
  });

  describe('usdcToNative', () => {
    it('converts 1 USDC (ERC-20) to native', () => {
      expect(usdcToNative(1_000_000n)).toBe(1_000_000_000_000_000_000n);
    });

    it('converts 0 correctly', () => {
      expect(usdcToNative(0n)).toBe(0n);
    });

    it('converts fractional USDC', () => {
      // 0.01 USDC = 10_000 in ERC-20
      expect(usdcToNative(10_000n)).toBe(10_000_000_000_000_000n);
    });

    it('converts large amounts', () => {
      // 1,000,000 USDC
      expect(usdcToNative(1_000_000_000_000n)).toBe(1_000_000_000_000_000_000_000_000n);
    });
  });

  describe('usdcToErc20', () => {
    it('converts 1 USDC (native) to ERC-20', () => {
      expect(usdcToErc20(1_000_000_000_000_000_000n)).toBe(1_000_000n);
    });

    it('truncates sub-ERC20-unit remainder', () => {
      // 1 USDC + some dust in native
      expect(usdcToErc20(1_000_000_500_000_000_000n)).toBe(1_000_000n);
    });

    it('converts 0 correctly', () => {
      expect(usdcToErc20(0n)).toBe(0n);
    });
  });

  describe('round-trip conversions', () => {
    it('erc20 -> native -> erc20 is identity', () => {
      const original = 123_456_789n;
      expect(usdcToErc20(usdcToNative(original))).toBe(original);
    });

    it('native -> erc20 -> native loses sub-unit precision', () => {
      const original = 1_000_000_000_000_000_001n; // 1 USDC + 1 wei
      const roundTripped = usdcToNative(usdcToErc20(original));
      expect(roundTripped).toBe(1_000_000_000_000_000_000n);
    });
  });
});

describe('parseUnits / formatUnits', () => {
  it('parses whole numbers', () => {
    expect(parseUnits('100', 6)).toBe(100_000_000n);
  });

  it('parses decimal amounts', () => {
    expect(parseUnits('1.5', 6)).toBe(1_500_000n);
  });

  it('parses amounts with excess precision (truncates)', () => {
    expect(parseUnits('1.1234567', 6)).toBe(1_123_456n);
  });

  it('formats whole numbers', () => {
    expect(formatUnits(100_000_000n, 6)).toBe('100');
  });

  it('formats decimal amounts', () => {
    expect(formatUnits(1_500_000n, 6)).toBe('1.5');
  });

  it('formats zero', () => {
    expect(formatUnits(0n, 6)).toBe('0');
  });

  it('round-trips correctly', () => {
    const original = '123.456';
    expect(formatUnits(parseUnits(original, 6), 6)).toBe(original);
  });
});

describe('USDC-specific helpers', () => {
  it('parseUsdcErc20 uses 6 decimals', () => {
    expect(parseUsdcErc20('100')).toBe(100_000_000n);
  });

  it('parseUsdcNative uses 18 decimals', () => {
    expect(parseUsdcNative('1')).toBe(1_000_000_000_000_000_000n);
  });

  it('formatUsdcErc20 uses 6 decimals', () => {
    expect(formatUsdcErc20(1_500_000n)).toBe('1.5');
  });

  it('formatUsdcNative uses 18 decimals', () => {
    expect(formatUsdcNative(1_500_000_000_000_000_000n)).toBe('1.5');
  });
});
