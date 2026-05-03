"use client";

import type { ReactNode } from "react";

type TrackedDownloadLinkProps = {
  href: string;
  trackHref: string;
  filename: string;
  className?: string;
  children: ReactNode;
};

export default function TrackedDownloadLink({
  href,
  trackHref,
  filename,
  className,
  children,
}: TrackedDownloadLinkProps) {
  function recordClick() {
    const separator = trackHref.includes("?") ? "&" : "?";
    const trackingUrl = `${trackHref}${separator}source=download-click&t=${Date.now()}`;

    void fetch(trackingUrl, {
      cache: "no-store",
      credentials: "same-origin",
      keepalive: true,
      redirect: "manual",
    }).catch(() => {
      // Download must never be blocked by analytics failure.
    });
  }

  return (
    <a
      href={href}
      download={filename}
      rel="nofollow"
      className={className}
      onClick={recordClick}
    >
      {children}
    </a>
  );
}
