"use client";

import type { OfflineSigner } from "@cosmjs/proto-signing";

import {
  WOLO_BASE_DENOM,
  WOLO_CHAIN_ID,
  WOLO_CHALLENGE_ESCROW_ADDRESS,
  WOLO_DEFAULT_GAS_PRICE,
  WOLO_RPC_URL,
  toUwoLoAmount,
  woloChainConfig,
} from "@/lib/woloChain";
import { buildChallengeFundingMemo } from "@/lib/challengeFundingMemo";

type ChallengeFundingWindow = Window & {
  keplr?: {
    enable?: (chainId: string) => Promise<void>;
    experimentalSuggestChain?: (config: typeof woloChainConfig) => Promise<void>;
    getOfflineSignerAuto?: (chainId: string) => Promise<unknown>;
    getOfflineSignerOnlyAmino?: (chainId: string) => unknown;
    getKey?: (chainId: string) => Promise<{ bech32Address?: string; isNanoLedger?: boolean }>;
  };
  getOfflineSigner?: (chainId: string) => unknown;
  getOfflineSignerOnlyAmino?: (chainId: string) => unknown;
};

type ChallengeSignerResolution = {
  signer: OfflineSigner;
  signerAddress: string;
  isLedger: boolean;
};

function describeChallengeFundingError(error: unknown, isLedger?: boolean) {
  const message =
    error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("rejected") ||
    normalized.includes("denied") ||
    normalized.includes("cancelled") ||
    normalized.includes("canceled")
  ) {
    return isLedger
      ? "Ledger approval was cancelled before challenge funding finished."
      : "Keplr approval was cancelled before challenge funding finished.";
  }

  if (normalized.includes("ledger") || normalized.includes("device") || normalized.includes("usb")) {
    return "Ledger did not finish signing challenge funding. Unlock it, open the Cosmos app, then approve in Keplr and on-device.";
  }

  if (normalized.includes("failed to fetch") || normalized.includes("network")) {
    return "The WOLO chain handshake dropped before challenge funding finished. Refresh and retry once.";
  }

  return message || "Challenge funding could not be broadcast.";
}

async function resolveChallengeSigner(
  keplrWindow: ChallengeFundingWindow,
  fallbackAddress: string
): Promise<ChallengeSignerResolution> {
  const key = keplrWindow.keplr?.getKey
    ? await keplrWindow.keplr.getKey(WOLO_CHAIN_ID).catch(() => null)
    : null;
  const keyAddress = key?.bech32Address?.trim() || "";
  const isLedger = Boolean((key as { isNanoLedger?: boolean } | null)?.isNanoLedger);

  if (isLedger) {
    const signer =
      (keplrWindow.keplr?.getOfflineSignerOnlyAmino?.(WOLO_CHAIN_ID) ||
        keplrWindow.getOfflineSignerOnlyAmino?.(WOLO_CHAIN_ID)) as OfflineSigner | undefined;

    if (!signer) {
      throw new Error("Ledger account detected, but Keplr Amino signer is unavailable.");
    }

    const accounts = await signer.getAccounts();
    const signerAddress = accounts[0]?.address?.trim() || keyAddress || fallbackAddress;
    if (!signerAddress) {
      throw new Error("Connected Ledger returned no WOLO address.");
    }

    return { signer, signerAddress, isLedger };
  }

  if (keplrWindow.keplr?.getOfflineSignerAuto) {
    const signer = (await keplrWindow.keplr.getOfflineSignerAuto(WOLO_CHAIN_ID)) as OfflineSigner;
    const accounts = await signer.getAccounts();
    const signerAddress = accounts[0]?.address?.trim() || keyAddress || fallbackAddress;
    if (!signerAddress) {
      throw new Error("Connected wallet returned no WOLO address.");
    }

    return { signer, signerAddress, isLedger: false };
  }

  const signer =
    (keplrWindow.getOfflineSignerOnlyAmino?.(WOLO_CHAIN_ID) ||
      keplrWindow.getOfflineSigner?.(WOLO_CHAIN_ID)) as OfflineSigner | undefined;

  if (!signer) {
    throw new Error("Keplr offline signer was not found in this browser.");
  }

  const accounts = await signer.getAccounts();
  const signerAddress = accounts[0]?.address?.trim() || keyAddress || fallbackAddress;
  if (!signerAddress) {
    throw new Error("Connected wallet returned no WOLO address.");
  }

  return { signer, signerAddress, isLedger: false };
}

export function challengeFundingEscrowAddress() {
  return WOLO_CHALLENGE_ESCROW_ADDRESS || "";
}

export async function fundChallengeEscrow(input: {
  challengeId: number;
  wagerAmountWolo: number;
  guaranteeAmountWolo: number;
  participantSide: "left" | "right";
  escrowAddress?: string | null;
  fallbackWalletAddress?: string | null;
}) {
  const escrowAddress =
    input.escrowAddress?.trim() || challengeFundingEscrowAddress();
  if (!escrowAddress) {
    throw new Error(
      "Challenge escrow is not configured. Refresh once; if it remains unavailable, the funding rail needs operator attention."
    );
  }

  const keplrWindow = window as ChallengeFundingWindow;
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

  if (keplrWindow.keplr.enable) {
    await keplrWindow.keplr.enable(WOLO_CHAIN_ID);
  }

  const signerResolution = await resolveChallengeSigner(
    keplrWindow,
    input.fallbackWalletAddress?.trim() || ""
  );

  const [{ GasPrice, SigningStargateClient }] = await Promise.all([
    import("@cosmjs/stargate"),
  ]);

  let client:
    | Awaited<ReturnType<typeof SigningStargateClient.connectWithSigner>>
    | null = null;

  try {
    client = await SigningStargateClient.connectWithSigner(
      WOLO_RPC_URL,
      signerResolution.signer,
      {
        gasPrice: GasPrice.fromString(WOLO_DEFAULT_GAS_PRICE),
      }
    );

    const totalFundingWolo = input.wagerAmountWolo + input.guaranteeAmountWolo;
    const memo = buildChallengeFundingMemo(input);

    const result = await client.sendTokens(
      signerResolution.signerAddress,
      escrowAddress,
      [{ amount: toUwoLoAmount(totalFundingWolo), denom: WOLO_BASE_DENOM }],
      "auto",
      memo
    );

    return {
      walletAddress: signerResolution.signerAddress,
      fundingTxHash: result.transactionHash,
    };
  } catch (error) {
    throw new Error(describeChallengeFundingError(error, signerResolution.isLedger));
  } finally {
    client?.disconnect();
  }
}
