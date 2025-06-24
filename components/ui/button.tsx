import { ButtonHTMLAttributes, forwardRef } from "react";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={`px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white ${className}`}
    {...props}
  />
));
