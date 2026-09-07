import Image from "next/image";
import { cn } from "@/lib/utils";

export function CatalogPhoto({ src, name, className = "size-16" }: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  if (!src) return null;
  // Private uploads need the browser session; the image optimizer does not forward it.
  return <Image src={src} alt={`Foto ${name}`} width={320} height={180} unoptimized loading="lazy" className={cn("shrink-0 rounded-lg bg-white object-contain p-1", className)} />;
}
