import { parseAbi } from 'viem';

export const PROTOCOL_EVENTS = parseAbi([
  'event Liquidated(address indexed user, address indexed asset, address indexed liquidator, uint256 repaid, uint256 seized)',
  'event Deposited(address indexed user, address indexed asset, uint256 amount)',
  'event Withdrawn(address indexed user, address indexed asset, uint256 amount)',
  'event Borrowed(address indexed user, uint256 amount)',
  'event Repaid(address indexed user, uint256 amount)',
  'event TradeExecuted(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
]);
