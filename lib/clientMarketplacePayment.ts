"use client";

import type { OfflineSigner } from "@cosmjs/proto-signing";

import {
  WOLO_BASE_DENOM,
  WOLO_CHAIN_ID,
  WOLO_DEFAULT_GAS_PRICE,
  WOLO_RPC_URL,
  estimateWoloNetworkFeeWolo,
  toUwoLoAmount,
  woloChainConfig,
} from "@/lib/woloChain";

type MarketplacePaymentWindow = Window & {
  keplr?: {
    enable?: (chainId: string) => Promise<void>;
    experimentalSuggestChain?: (
      config: typeof woloChainConfig,
    ) => Promise<void>;
    getOfflineSignerAuto?: (chainId: string) => Promise<unknown>;
    getOfflineSignerOnlyAmino?: (chainId: string) => unknown;
    getKey?: (
      chainId: string,
    ) => Promise<{ bech32Address?: string; isNanoLedger?: boolean }>;
  };
  getOfflineSigner?: (chainId: string) => unknown;
  getOfflineSignerOnlyAmino?: (chainId: string) => unknown;
};

function describeMarketplacePaymentError(error: unknown, isLedger: boolean) {
  const message =
    error instanceof Error
      ? error.message.trim()
      : typeof error === "string"
        ? error.trim()
        : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("rejected") ||
    normalized.includes("denied") ||
    normalized.includes("cancelled") ||
    normalized.includes("canceled")
  ) {
    return isLedger
      ? "Ledger approval was cancelled before the WOLO payment finished."
      : "Keplr approval was cancelled before the WOLO payment finished.";
  }

  if (
    normalized.includes("ledger") ||
    normalized.includes("device") ||
    normalized.includes("usb")
  ) {
    return "Ledger did not finish signing. Unlock it, open the Cosmos app, and approve the WOLO payment.";
  }

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network")
  ) {
    return "The WoloChain connection dropped before payment finished. Refresh and retry once.";
  }

  return message || "The WOLO payment could not be broadcast.";
}

async function resolveMarketplaceSigner(
  keplrWindow: MarketplacePaymentWindow,
  fallbackAddress: string,
) {
  const key = keplrWindow.keplr?.getKey
    ? await keplrWindow.keplr.getKey(WOLO_CHAIN_ID).catch(() => null)
    : null;
  const keyAddress = key?.bech32Address?.trim() || "";
  const isLedger = Boolean(
    (key as { isNanoLedger?: boolean } | null)?.isNanoLedger,
  );

  if (isLedger) {
    const signer = (keplrWindow.keplr?.getOfflineSignerOnlyAmino?.(
      WOLO_CHAIN_ID,
    ) || keplrWindow.getOfflineSignerOnlyAmino?.(WOLO_CHAIN_ID)) as
      OfflineSigner | undefined;

    if (!signer) {
      throw new Error(
        "Ledger account detected, but Keplr Amino signer is unavailable.",
      );
    }

    const accounts = await signer.getAccounts();
    const signerAddress =
      accounts[0]?.address?.trim() || keyAddress || fallbackAddress;

    if (!signerAddress) {
      throw new Error("Connected Ledger returned no WOLO address.");
    }

    return { signer, signerAddress, isLedger };
  }

  if (keplrWindow.keplr?.getOfflineSignerAuto) {
    const signer = (await keplrWindow.keplr.getOfflineSignerAuto(
      WOLO_CHAIN_ID,
    )) as OfflineSigner;
    const accounts = await signer.getAccounts();
    const signerAddress =
      accounts[0]?.address?.trim() || keyAddress || fallbackAddress;

    if (!signerAddress) {
      throw new Error("Connected wallet returned no WOLO address.");
    }

    return { signer, signerAddress, isLedger: false };
  }

  const signer = (keplrWindow.getOfflineSignerOnlyAmino?.(WOLO_CHAIN_ID) ||
    keplrWindow.getOfflineSigner?.(WOLO_CHAIN_ID)) as OfflineSigner | undefined;

  if (!signer) {
    throw new Error("Keplr offline signer was not found in this browser.");
  }

  const accounts = await signer.getAccounts();
  const signerAddress =
    accounts[0]?.address?.trim() || keyAddress || fallbackAddress;

  if (!signerAddress) {
    throw new Error("Connected wallet returned no WOLO address.");
  }

  return { signer, signerAddress, isLedger: false };
}

export async function payMarketplaceRequestOnChain(input: {
  recipientAddress: string;
  amountWolo: number;
  memo: string;
  fallbackWalletAddress?: string | null;
}) {
  if (!/^wolo1[0-9a-z]{20,90}$/i.test(input.recipientAddress.trim())) {
    throw new Error("The marketplace payout wallet is not configured.");
  }

  if (!Number.isFinite(input.amountWolo) || input.amountWolo <= 0) {
    throw new Error("The marketplace price is not valid.");
  }

  const keplrWindow = window as MarketplacePaymentWindow;
  if (!keplrWindow.keplr) {
    throw new Error("Keplr extension not found.");
  }

  if (keplrWindow.keplr.experimentalSuggestChain) {
    try {
      await keplrWindow.keplr.experimentalSuggestChain(woloChainConfig);
    } catch (error) {
      console.warn("WoloChain suggest failed or already exists:", error);
    }
  }

  await keplrWindow.keplr.enable?.(WOLO_CHAIN_ID);

  const signerResolution = await resolveMarketplaceSigner(
    keplrWindow,
    input.fallbackWalletAddress?.trim() || "",
  );

  const [{ GasPrice, SigningStargateClient }] = await Promise.all([
    import("@cosmjs/stargate"),
  ]);

  let client: Awaited<
    ReturnType<typeof SigningStargateClient.connectWithSigner>
  > | null = null;

  try {
    client = await SigningStargateClient.connectWithSigner(
      WOLO_RPC_URL,
      signerResolution.signer,
      {
        gasPrice: GasPrice.fromString(WOLO_DEFAULT_GAS_PRICE),
      },
    );

    const result = await client.sendTokens(
      signerResolution.signerAddress,
      input.recipientAddress.trim(),
      [
        {
          amount: toUwoLoAmount(input.amountWolo),
          denom: WOLO_BASE_DENOM,
        },
      ],
      "auto",
      input.memo,
    );

    return {
      walletAddress: signerResolution.signerAddress,
      transactionHash: result.transactionHash,
      txFeeWolo: estimateWoloNetworkFeeWolo(result.gasWanted),
    };
  } catch (error) {
    throw new Error(
      describeMarketplacePaymentError(error, signerResolution.isLedger),
    );
  } finally {
    client?.disconnect();
  }
}

export const payWoloOnChain = payMarketplaceRequestOnChain;
