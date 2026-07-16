import path from "path";

export const RADIO_RIGHTS_STATEMENT_VERSION = "radio-wolo-limited-play-v1";
export const RADIO_RIGHTS_STATEMENT =
  "I confirm that I own or control the rights needed to submit this music, and I grant AoE2WAR a non-exclusive, revocable permission to store, review, stream, and promote this submitted track on Radio WOLO and related AoE2WAR programming. Copyright remains with the rights holder.";

const PRODUCTION_RADIO_ROOT = "/mnt/HC_Volume_105319120/aoe2-radio-wolo";

export function getRadioStorageRoot() {
  return path.resolve(
    process.env.RADIO_WOLO_MEDIA_DIR ||
      (process.env.NODE_ENV === "production"
        ? PRODUCTION_RADIO_ROOT
        : path.join(process.cwd(), "storage", "radio-wolo"))
  );
}

export function radioStoragePath(storageKey: string) {
  const root = getRadioStorageRoot();
  const target = path.resolve(root, storageKey);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid Radio WOLO storage key.");
  }
  return target;
}

export function safeOriginalFilename(value: string) {
  return path
    .basename(value || "upload")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._() -]+/g, "_")
    .slice(0, 255) || "upload";
}

export function detectAudioType(bytes: Uint8Array) {
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WAVE") {
    return { extension: ".wav", mediaType: "audio/wav" };
  }
  if (bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === "OggS") {
    return { extension: ".ogg", mediaType: "audio/ogg" };
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") {
    return { extension: ".m4a", mediaType: "audio/mp4" };
  }
  if (
    bytes.length >= 3 &&
    (String.fromCharCode(...bytes.slice(0, 3)) === "ID3" ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))
  ) {
    return { extension: ".mp3", mediaType: "audio/mpeg" };
  }
  return null;
}

export function detectArtworkType(bytes: Uint8Array) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && String.fromCharCode(...bytes.slice(1, 4)) === "PNG") {
    return { extension: ".png", mediaType: "image/png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: ".jpg", mediaType: "image/jpeg" };
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return { extension: ".webp", mediaType: "image/webp" };
  }
  return null;
}

