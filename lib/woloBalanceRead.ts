export type WoloBalanceReadState =
  | "disconnected"
  | "loading"
  | "success-zero"
  | "success-funded"
  | "refreshing"
  | "error";

export type WoloBalanceApiPayload = {
  amount: string;
  address: string;
  denom: string;
  decimals: number;
  chainId: string;
  source: "rest" | "cli";
  observedAt: string;
};

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const MAX_MINIMAL_DENOM_DIGITS = 78;
const BECH32_GENERATORS = [
  0x3b6a57b2,
  0x26508e6d,
  0x1ea119fa,
  0x3d4233dd,
  0x2a1462b3,
];

function bech32Polymod(values: number[]) {
  let checksum = 1;
  for (const value of values) {
    const high = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < BECH32_GENERATORS.length; index += 1) {
      if ((high >>> index) & 1) checksum ^= BECH32_GENERATORS[index];
    }
  }
  return checksum >>> 0;
}

function bech32HrpValues(hrp: string) {
  return [
    ...[...hrp].map((character) => character.charCodeAt(0) >>> 5),
    0,
    ...[...hrp].map((character) => character.charCodeAt(0) & 31),
  ];
}

function decodedBech32ByteLength(words: number[]) {
  let accumulator = 0;
  let bits = 0;
  let byteLength = 0;

  for (const word of words) {
    if (word < 0 || word > 31) return null;
    accumulator = (accumulator << 5) | word;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      byteLength += 1;
      accumulator &= (1 << bits) - 1;
    }
  }

  if (bits >= 5 || ((accumulator << (8 - bits)) & 0xff) !== 0) return null;
  return byteLength;
}

export function isValidBech32AccountAddress(
  value: unknown,
  expectedPrefix: string,
  expectedByteLength = 20,
) {
  if (typeof value !== "string" || value !== value.toLowerCase()) return false;
  if (value.length < 8 || value.length > 90) return false;

  const separator = value.lastIndexOf("1");
  if (separator <= 0 || separator + 7 > value.length) return false;
  const prefix = value.slice(0, separator);
  if (prefix !== expectedPrefix) return false;

  const data = [...value.slice(separator + 1)].map((character) =>
    BECH32_CHARSET.indexOf(character),
  );
  if (data.some((word) => word < 0)) return false;
  if (bech32Polymod([...bech32HrpValues(prefix), ...data]) !== 1) return false;

  const byteLength = decodedBech32ByteLength(data.slice(0, -6));
  return byteLength === expectedByteLength;
}

export function normalizeMinimalDenomAmount(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_MINIMAL_DENOM_DIGITS ||
    !/^\d+$/.test(value)
  ) {
    throw new Error("Balance amount must be an unsigned base-10 integer string.");
  }

  return value.replace(/^0+(?=\d)/, "");
}

export function parseWoloBalanceApiPayload(
  value: unknown,
  expected: {
    address: string;
    denom: string;
    decimals: number;
    chainId: string;
  },
): WoloBalanceApiPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Balance response was not an object.");
  }

  const payload = value as Record<string, unknown>;
  const amount = normalizeMinimalDenomAmount(payload.amount);

  if (payload.address !== expected.address) {
    throw new Error("Balance response address did not match the connected wallet.");
  }

  if (payload.denom !== expected.denom) {
    throw new Error(`Balance response denom must be ${expected.denom}.`);
  }

  if (payload.decimals !== expected.decimals) {
    throw new Error(`Balance response decimals must be ${expected.decimals}.`);
  }

  if (payload.chainId !== expected.chainId) {
    throw new Error(`Balance response chain must be ${expected.chainId}.`);
  }

  if (payload.source !== "rest" && payload.source !== "cli") {
    throw new Error("Balance response provenance was missing.");
  }

  const observedAtMs =
    typeof payload.observedAt === "string" ? Date.parse(payload.observedAt) : NaN;
  if (
    typeof payload.observedAt !== "string" ||
    !Number.isFinite(observedAtMs) ||
    new Date(observedAtMs).toISOString() !== payload.observedAt
  ) {
    throw new Error("Balance response observation time was invalid.");
  }

  return {
    amount,
    address: expected.address,
    denom: expected.denom,
    decimals: expected.decimals,
    chainId: expected.chainId,
    source: payload.source,
    observedAt: payload.observedAt,
  };
}

export function formatMinimalDenomAmount(
  value: unknown,
  decimals = 6,
  minimumFractionDigits = 2,
): string | null {
  if (!Number.isInteger(decimals) || decimals < 0) return null;
  if (
    !Number.isInteger(minimumFractionDigits) ||
    minimumFractionDigits < 0 ||
    minimumFractionDigits > decimals
  ) {
    return null;
  }

  let amount: string;
  try {
    amount = normalizeMinimalDenomAmount(value);
  } catch {
    return null;
  }

  if (decimals === 0) {
    return BigInt(amount).toLocaleString("en-US");
  }

  const padded = amount.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  let fraction = padded.slice(-decimals);

  while (fraction.length > minimumFractionDigits && fraction.endsWith("0")) {
    fraction = fraction.slice(0, -1);
  }

  return `${BigInt(whole).toLocaleString("en-US")}.${fraction}`;
}

export function deriveWoloBalanceReadState(input: {
  connected: boolean;
  amount?: string;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
}): WoloBalanceReadState {
  if (!input.connected) return "disconnected";
  if (input.isError) return "error";

  if (input.amount === undefined) {
    return input.isLoading || input.isFetching ? "loading" : "error";
  }

  let amount: string;
  try {
    amount = normalizeMinimalDenomAmount(input.amount);
  } catch {
    return "error";
  }

  if (input.isFetching) return "refreshing";
  return amount === "0" ? "success-zero" : "success-funded";
}

export function resolveVerifiedWalletStakeCap(
  amountUwolo: unknown,
  maximumWolo = 50_000,
) {
  if (!Number.isSafeInteger(maximumWolo) || maximumWolo <= 0) return 0;

  let amount: string;
  try {
    amount = normalizeMinimalDenomAmount(amountUwolo);
  } catch {
    return 0;
  }

  const wholeWolo = BigInt(amount) / BigInt(1_000_000);
  if (wholeWolo <= BigInt(0)) return 0;
  const bounded = wholeWolo > BigInt(maximumWolo) ? BigInt(maximumWolo) : wholeWolo;
  return Number(bounded);
}
