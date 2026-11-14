"use client";

import { MotionConfig } from "motion/react";
import { WalletProvider } from "@/lib/near";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      {/* motion respects the OS reduced-motion preference everywhere */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </WalletProvider>
  );
}
