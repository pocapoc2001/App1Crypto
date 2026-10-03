import { notFound } from "next/navigation";
import { ProfileView } from "./profile-view";

export default async function Page({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) notFound();
  return <ProfileView address={address as `0x${string}`} />;
}
