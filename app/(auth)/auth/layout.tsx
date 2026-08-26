import { Brand } from "@/components/brand";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(320px,0.85fr)_minmax(480px,1.15fr)]">
      <section className="relative flex min-h-48 overflow-hidden bg-brand-navy px-6 py-8 text-white sm:px-10 lg:min-h-screen lg:flex-col lg:justify-between lg:px-12 lg:py-10">
        <Brand />

        <div className="pointer-events-none absolute -bottom-12 -right-12 text-white/10 lg:bottom-16 lg:right-8">
          <svg
            aria-hidden="true"
            className="size-56 lg:size-80"
            viewBox="0 0 40 40"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          >
            <path d="M20 4 35 12v16l-15 8-15-8V12Z" />
            <path d="M14 16h12M14 20h9M14 24h6" strokeLinecap="round" />
          </svg>
        </div>

        <div className="relative z-10 hidden max-w-md lg:block">
          <p className="mb-3 text-xs font-semibold uppercase text-brand-copper">
            Portale materiali
          </p>
          <p className="font-heading text-4xl font-semibold leading-tight">
            Accesso riservato al personale autorizzato.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
