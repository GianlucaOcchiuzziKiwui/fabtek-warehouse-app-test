import type { ReactNode } from "react";

export function PageHeading({
  title,
  description,
}: {
  title: ReactNode;
  description?: string;
}) {
  return (
    <header className="max-w-3xl">
      <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
      ) : null}
    </header>
  );
}
