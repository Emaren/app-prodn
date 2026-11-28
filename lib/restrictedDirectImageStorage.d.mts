export function isRestrictedImageReference(ref: unknown): boolean;
export function readRestrictedImage(root: string | undefined, ref: string, mime: string | null): Promise<{buffer: Buffer; mimeType: string} | null>;
