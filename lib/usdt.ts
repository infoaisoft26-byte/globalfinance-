const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export const USDT_DECIMALS = 18;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function normalizeAddress(value: string) {
  const v = value.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(v)) throw new Error('Invalid BSC wallet address');
  return v;
}

function normalizeTxHash(value: string) {
  const v = value.trim().toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(v)) throw new Error('Invalid BSC transaction hash');
  return v;
}

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(required('BSC_RPC_URL'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error('BSC RPC request failed');
  const payload = await response.json() as { result?: unknown; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message || 'BSC RPC error');
  return payload.result;
}

export type VerifiedUsdtTransfer = {
  txHash: string;
  fromAddress: string;
  toAddress: string;
  amountBaseUnits: bigint;
  blockNumber: bigint;
  confirmations: bigint;
};

export async function verifyUsdtDeposit(txHashInput: string): Promise<VerifiedUsdtTransfer> {
  const txHash = normalizeTxHash(txHashInput);
  const contract = normalizeAddress(required('USDT_BEP20_CONTRACT_ADDRESS'));
  const destination = normalizeAddress(required('USDT_DEPOSIT_WALLET_ADDRESS'));

  const chainId = String(await rpc('eth_chainId', []));
  if (chainId.toLowerCase() !== '0x38') {
    throw new Error('Configured RPC is not BSC Mainnet (chain ID 56)');
  }

  const receipt = await rpc('eth_getTransactionReceipt', [txHash]) as any;
  if (!receipt) throw new Error('Transaction not found or not confirmed yet');
  if (receipt.status !== '0x1') throw new Error('Blockchain transaction failed');

  const blockNumber = BigInt(receipt.blockNumber);
  const latestBlockRaw = await rpc('eth_blockNumber', []);
  if (typeof latestBlockRaw !== 'string') throw new Error('Latest BSC block number is missing');
  const latestBlock = BigInt(latestBlockRaw);
  const confirmations = latestBlock >= blockNumber ? latestBlock - blockNumber + 1n : 0n;
  if (confirmations < 12n) throw new Error(`Waiting for confirmations: ${confirmations}/12`);

  const matching = (receipt.logs || []).filter((log: any) => {
    return String(log.address || '').toLowerCase() === contract &&
      Array.isArray(log.topics) &&
      log.topics.length >= 3 &&
      String(log.topics[0]).toLowerCase() === TRANSFER_TOPIC;
  });

  const transfers = matching.map((log: any) => ({
    fromAddress: ('0x' + String(log.topics[1]).slice(-40)).toLowerCase(),
    toAddress: ('0x' + String(log.topics[2]).slice(-40)).toLowerCase(),
    amountBaseUnits: BigInt(log.data),
  })).filter((transfer: { toAddress: string }) => transfer.toAddress === destination);

  if (transfers.length === 0) throw new Error('No USDT transfer to the configured deposit wallet was found');

  if (transfers.length > 1) throw new Error('Multiple matching USDT transfers found; contact support before crediting');

  const transfer = transfers[0];
  if (transfer.amountBaseUnits <= 0n) throw new Error('USDT transfer amount must be greater than zero');

  return {
    txHash,
    fromAddress: transfer.fromAddress,
    toAddress: transfer.toAddress,
    amountBaseUnits: transfer.amountBaseUnits,
    blockNumber,
    confirmations,
  };
}

export function formatUsdt(baseUnits: bigint | string | number) {
  const raw = typeof baseUnits === 'bigint' ? baseUnits : BigInt(String(baseUnits || 0));
  const whole = raw / 10n ** 18n;
  const fraction = (raw % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}
