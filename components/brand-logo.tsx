import Image from "next/image";

export function BrandLogo({ className }: { className: string }) {
  return (
    <Image
      src="/logo.png"
      alt="Fabtek - Integrated Solution for Industries"
      width={1024}
      height={318}
      className={className}
    />
  );
}
