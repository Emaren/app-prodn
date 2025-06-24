import { cn } from "@/lib/utils"; // optional helper
import { ReactNode, HTMLAttributes } from "react";

export function Card({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn("border rounded-lg p-4 bg-gray-800", className)} {...props}>
      {children}
    </div>
  );
}

export function CardContent({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn("p-4", className)} {...props}>
      {children}
    </div>
  );
}
