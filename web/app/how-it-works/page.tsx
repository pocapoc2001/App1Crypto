import type { Metadata } from "next";
import { HowItWorks } from "./how-it-works";

export const metadata: Metadata = { title: "How it works" };

export default function Page() {
  return <HowItWorks />;
}
