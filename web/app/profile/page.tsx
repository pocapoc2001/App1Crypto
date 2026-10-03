"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useT } from "@/lib/i18n";

export default function ProfileRedirect() {
  const { address } = useAccount();
  const router = useRouter();
  const { t } = useT();
  useEffect(() => {
    if (address) router.replace(`/profile/${address}`);
  }, [address, router]);
  return (
    <div className="mx-auto mt-16 max-w-sm space-y-4 rounded-2xl border bg-card p-8 text-center">
      <p className="text-muted-foreground">{t("profile.connectPrompt")}</p>
      <div className="flex justify-center">
        <ConnectButton />
      </div>
    </div>
  );
}
