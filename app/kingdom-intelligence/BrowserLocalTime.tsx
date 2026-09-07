"use client";

import { useEffect, useState } from "react";

export default function BrowserLocalTime({ value }: { value: string }) {
  const [label, setLabel] = useState("—");
  const [title, setTitle] = useState(value);

  useEffect(() => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      setLabel("—");
      setTitle(value);
      return;
    }

    setLabel(
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(date),
    );
    setTitle(
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "long",
      }).format(date),
    );
  }, [value]);

  return (
    <time dateTime={value} title={title} suppressHydrationWarning>
      {label}
    </time>
  );
}
