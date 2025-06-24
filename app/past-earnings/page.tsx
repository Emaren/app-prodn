"use client";

import React from 'react';
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const PastEarningsPage = () => {
  const router = useRouter();
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Past Earnings</h1>
      <p>Review your past earnings here.</p>
      <Button
        className="mt-6 bg-blue-600 hover:bg-blue-700 px-6 py-3"
        onClick={() => router.push("/")}
      >
        ⬅️ Back to Home
      </Button>
    </div>
  );
};

export default PastEarningsPage;
