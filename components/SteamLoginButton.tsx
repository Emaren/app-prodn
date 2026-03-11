"use client";

import { ButtonHTMLAttributes } from "react";
import { useUserAuth } from "@/context/UserAuthContext";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string;
  returnTo?: string;
};

export default function SteamLoginButton({
  label = "Sign In With Steam",
  returnTo,
  className,
  ...props
}: Props) {
  const { loginWithSteam } = useUserAuth();

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const nextReturnTo =
          returnTo ||
          (typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}`
            : "/");
        loginWithSteam(nextReturnTo);
      }}
      {...props}
    >
      {label}
    </button>
  );
}
