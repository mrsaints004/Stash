export const STASH_LIQUIDATION_ABI = [
  {
    type: 'function',
    name: 'liquidate',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'collateralAsset', type: 'address' },
      { name: 'debtToRepay', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isLiquidatable',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'isLiquidatable_', type: 'bool' },
      { name: 'currentLtv', type: 'uint256' },
      { name: 'debt', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'liquidationsEnabled',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'LIQUIDATION_THRESHOLD_BPS',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'LIQUIDATION_BONUS_BPS',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;
