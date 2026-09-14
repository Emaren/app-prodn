export const STREAM_MEDIA_SHED_CODE = "STREAM_MEDIA_SHED" as const;

export type StreamMediaShedReason =
  | "replay_upload_priority"
  | "operator_kill_switch";

type AdmissionState = {
  activeReplayUploads: number;
};

type GlobalWithAdmission = typeof globalThis & {
  __aoe2warStreamMediaAdmissionV1?: AdmissionState;
};

export type StreamMediaAdmission =
  | {
      allow: true;
      activeReplayUploads: number;
      operatorKillSwitch: false;
    }
  | {
      allow: false;
      terminal: true;
      code: typeof STREAM_MEDIA_SHED_CODE;
      reason: StreamMediaShedReason;
      retryAfterSeconds: number;
      activeReplayUploads: number;
      operatorKillSwitch: boolean;
    };

function state() {
  const root = globalThis as GlobalWithAdmission;
  root.__aoe2warStreamMediaAdmissionV1 ??= { activeReplayUploads: 0 };
  return root.__aoe2warStreamMediaAdmissionV1;
}

function envEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export function evaluateStreamMediaAdmission(input: {
  activeReplayUploads: number;
  operatorKillSwitch: boolean;
}): StreamMediaAdmission {
  const activeReplayUploads = Math.max(0, Math.trunc(input.activeReplayUploads || 0));
  if (input.operatorKillSwitch) {
    return {
      allow: false,
      terminal: true,
      code: STREAM_MEDIA_SHED_CODE,
      reason: "operator_kill_switch",
      retryAfterSeconds: 60,
      activeReplayUploads,
      operatorKillSwitch: true,
    };
  }
  if (activeReplayUploads > 0) {
    return {
      allow: false,
      terminal: true,
      code: STREAM_MEDIA_SHED_CODE,
      reason: "replay_upload_priority",
      retryAfterSeconds: 15,
      activeReplayUploads,
      operatorKillSwitch: false,
    };
  }
  return { allow: true, activeReplayUploads, operatorKillSwitch: false };
}

export function currentStreamMediaAdmission() {
  return evaluateStreamMediaAdmission({
    activeReplayUploads: state().activeReplayUploads,
    operatorKillSwitch: envEnabled(process.env.AOE2_STREAM_MEDIA_KILL_SWITCH),
  });
}

export function beginReplayUploadMediaPressure() {
  const current = state();
  current.activeReplayUploads += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    current.activeReplayUploads = Math.max(0, current.activeReplayUploads - 1);
  };
}

export async function withReplayUploadMediaPressure<T>(operation: () => Promise<T>) {
  const release = beginReplayUploadMediaPressure();
  try {
    return await operation();
  } finally {
    release();
  }
}

export function resetStreamMediaAdmissionForTests() {
  state().activeReplayUploads = 0;
}
