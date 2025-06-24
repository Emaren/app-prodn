// components/AuthPasswordPrompt.tsx
"use client";

import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  password: string;
  setPassword: (pw: string) => void;
  onSubmit: () => void;
  mode: "login" | "register";
  loading: boolean;
}

export default function AuthPasswordPrompt({
  password,
  setPassword,
  onSubmit,
  mode,
  loading,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const title = mode === "login" ? "Enter your password" : "Set your password";
  const button = mode === "login" ? "Sign In" : "Register & Start Betting";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-6">
      <Card className="bg-gray-800 shadow-xl w-full max-w-md">
        <CardContent className="p-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="flex flex-col space-y-6"
          >
            <h1 className="text-xl font-bold text-center">{title}</h1>

            <Input
              ref={inputRef}
              className="text-black px-4 py-3 text-lg rounded-md"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <Button
              type="submit"
              disabled={loading || !password.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 py-3"
            >
              {button}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
