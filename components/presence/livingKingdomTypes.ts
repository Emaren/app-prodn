import type { LivingKingdomRealmId } from "@/lib/livingKingdom/realms";
import type {
  LivingKingdomDeltaEvent,
  LivingKingdomDoorEvent as ProtocolDoorEvent,
  LivingKingdomMotion as ProtocolMotion,
  LivingKingdomPublicActor,
  LivingKingdomSnapshotEvent,
} from "@/lib/livingKingdom/protocol";

export const LIVING_KINGDOM_DEPTH_BANDS = 21;

export type LivingKingdomMotion = ProtocolMotion;
export type LivingKingdomViewerMode = "full" | "calm" | "off";
export type LivingKingdomPublishMode = "off" | "public_coarse";

export type LivingKingdomActor = LivingKingdomPublicActor;
export type LivingKingdomSnapshot = LivingKingdomSnapshotEvent;
export type LivingKingdomDelta = LivingKingdomDeltaEvent;
export type LivingKingdomDoorEvent = ProtocolDoorEvent;

export type LivingKingdomPreference = {
  mode: LivingKingdomPublishMode;
  decisionRecorded: boolean;
  featureAllowed: boolean;
  displayEligible: boolean;
  avatarEligible: boolean;
  avatarUrl: string | null;
  displayName: string | null;
  enabledAt: string | null;
  updatedAt: string | null;
};

export type LivingKingdomFlight = {
  id: string;
  actor: LivingKingdomActor;
  fromRealmId: LivingKingdomRealmId;
  toRealmId: LivingKingdomRealmId;
  direction: "departure";
  createdAt: number;
};
