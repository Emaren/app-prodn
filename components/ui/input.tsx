// components/ui/input.tsx
import * as React from "react";
import { InputHTMLAttributes } from "react";

export const Input = React.forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  (props, ref) => {
    return (
      <input
        ref={ref}
        className="px-4 py-2 rounded-md border bg-gray-900 text-white w-full"
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
