import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo";

export const metadata: Metadata = noindexMetadata;

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
