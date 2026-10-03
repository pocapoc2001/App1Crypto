import type { Metadata } from "next";
import { CreateView } from "./create-view";

export const metadata: Metadata = { title: "Create a coin" };

export default function Page() {
  return <CreateView />;
}
