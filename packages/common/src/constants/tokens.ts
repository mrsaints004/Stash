import { ADDRESSES } from './addresses';

export interface TokenMetadata {
  symbol: string;
  name: string;
  decimals: number;
  address: string;
  isCollateral: boolean;
}

export const TOKENS: Record<string, TokenMetadata> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: ADDRESSES.USDC,
    isCollateral: false,
  },
  WETH: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    address: ADDRESSES.WETH,
    isCollateral: true,
  },
  cirBTC: {
    symbol: 'cirBTC',
    name: 'Circle BTC',
    decimals: 8,
    address: ADDRESSES.cirBTC,
    isCollateral: true,
  },
  EURC: {
    symbol: 'EURC',
    name: 'Euro Coin',
    decimals: 6,
    address: ADDRESSES.EURC,
    isCollateral: false,
  },
} as const;

export const COLLATERAL_TOKENS = Object.values(TOKENS).filter(
  (t) => t.isCollateral,
);
