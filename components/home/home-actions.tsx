import { ClipboardCheck, ClipboardPlus, Search } from "lucide-react";
import Link from "next/link";

const actionCards = [
  {
    href: "/richieste/nuova",
    title: "Crea richiesta materiale",
    description: "Compila i dati del cantiere e aggiungi gli articoli dal catalogo.",
    icon: ClipboardPlus,
  },
  {
    href: "/catalogo",
    title: "Cerca info materiali",
    description: "Consulta codici, dettagli tecnici e disponibilità dei materiali.",
    icon: Search,
  },
] as const;

export function HomeActions({ isAdmin }: { isAdmin: boolean }) {
  const requestsAction = isAdmin
    ? {
      href: "/admin/richieste",
      title: "Gestisci richieste",
      description: "Visualizza le richieste ricevute e registra le consegne.",
    }
    : {
      href: "/richieste",
      title: "Controlla richieste",
      description: "Segui lo stato e il dettaglio delle richieste già inviate.",
    };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {actionCards.map(({ href, title, description, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="group rounded-xl border border-border bg-card p-6 shadow-sm transition-[border-color,box-shadow,transform] hover:border-primary hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Icon aria-hidden="true" className="size-7 text-brand-copper" />
          <h2 className="mt-5 font-heading text-xl font-semibold text-foreground group-hover:text-primary">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        </Link>
      ))}
      <Link
        href={requestsAction.href}
        className="group rounded-xl border border-border bg-card p-6 shadow-sm transition-[border-color,box-shadow,transform] hover:border-primary hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ClipboardCheck aria-hidden="true" className="size-7 text-brand-copper" />
        <h2 className="mt-5 font-heading text-xl font-semibold text-foreground group-hover:text-primary">
          {requestsAction.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{requestsAction.description}</p>
      </Link>
    </div>
  );
}
