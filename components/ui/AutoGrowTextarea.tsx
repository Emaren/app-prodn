"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type CSSProperties,
  type TextareaHTMLAttributes,
} from "react";

type AutoGrowTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  maxRows?: number;
};

export default function AutoGrowTextarea({
  className,
  maxRows = 4,
  onChange,
  style,
  value,
  ...props
}: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof window === "undefined") {
      return;
    }

    textarea.style.height = "auto";

    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 24;
    const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computedStyle.paddingBottom) || 0;
    const borderTop = Number.parseFloat(computedStyle.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(computedStyle.borderBottomWidth) || 0;
    const maxHeight =
      lineHeight * Math.max(1, maxRows) + paddingTop + paddingBottom + borderTop + borderBottom;

    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [maxRows]);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [resizeTextarea, value]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(event);
      resizeTextarea();
    },
    [onChange, resizeTextarea]
  );

  return (
    <textarea
      {...props}
      ref={textareaRef}
      rows={1}
      value={value}
      onChange={handleChange}
      className={["resize-none", className].filter(Boolean).join(" ")}
      style={style as CSSProperties}
    />
  );
}
