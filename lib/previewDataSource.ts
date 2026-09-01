const PREVIEW_DATA_ENV =
  "AOE2WAR_PREVIEW_DATA_BASE";

const ALLOWED_PREVIEW_ORIGINS =
  new Set([
    "https://aoe2war.com",
  ]);

export function getPreviewDataOrigin():
  string | null {
  // A preview data source must never alter production behavior,
  // even if somebody accidentally leaves the environment variable set.
  if (
    process.env.NODE_ENV ===
    "production"
  ) {
    return null;
  }

  const raw =
    process.env[
      PREVIEW_DATA_ENV
    ]?.trim();

  if (!raw) {
    return null;
  }

  let parsed: URL;

  try {
    parsed =
      new URL(raw);
  } catch {
    throw new Error(
      `${PREVIEW_DATA_ENV} must be a valid URL`,
    );
  }

  if (
    !ALLOWED_PREVIEW_ORIGINS.has(
      parsed.origin,
    )
  ) {
    throw new Error(
      `${PREVIEW_DATA_ENV} may only use https://aoe2war.com`,
    );
  }

  return parsed.origin;
}

export function isLiveProductionReadOnlyPreview() {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return (
    process.env.AOE2WAR_PROD_DB_PREVIEW === "true" &&
    getPreviewDataOrigin() !== null
  );
}

export function buildPreviewDataUrl(
  pathname: string,
  searchParams?:
    URLSearchParams,
): URL | null {
  const origin =
    getPreviewDataOrigin();

  if (!origin) {
    return null;
  }

  const url =
    new URL(
      pathname,
      origin,
    );

  searchParams?.forEach(
    (value, key) => {
      url.searchParams.append(
        key,
        value,
      );
    },
  );

  return url;
}


export type PreviewIdentity = {
  uid: string;
  name: string;
};

export function getPreviewIdentity():
  PreviewIdentity | null {
  if (
    process.env.NODE_ENV ===
    "production"
  ) {
    return null;
  }

  if (!getPreviewDataOrigin()) {
    return null;
  }

  const name =
    process.env
      .AOE2WAR_PREVIEW_USER_NAME
      ?.trim();

  if (!name) {
    return null;
  }

  const explicitUid =
    process.env
      .AOE2WAR_PREVIEW_USER_UID
      ?.trim();

  return {
    uid:
      explicitUid ||
      `preview:${name
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          "-",
        )
        .replace(
          /^-+|-+$/g,
          "",
        )}`,
    name,
  };
}
