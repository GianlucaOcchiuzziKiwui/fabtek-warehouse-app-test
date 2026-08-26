import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Suspense } from "react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <p className="text-sm text-muted-foreground">
      {error ?? "Si è verificato un errore durante l'autenticazione."}
    </p>
  );
}

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Accesso non riuscito</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Caricamento...</p>}>
          <ErrorContent searchParams={searchParams} />
        </Suspense>
        <Link
          href="/auth/login"
          className="inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Torna al login
        </Link>
      </CardContent>
    </Card>
  );
}
