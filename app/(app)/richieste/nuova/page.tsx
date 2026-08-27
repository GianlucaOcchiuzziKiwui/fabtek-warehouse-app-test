import { RequestHeaderForm } from "@/components/requests/request-header-form";
import { PageHeading } from "@/components/shared/page-heading";
import { buildRequestMaterialsHref } from "@/lib/domain/requests/navigation";

type RequestSearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: RequestSearchParams;
}) {
  const params = await searchParams;
  const continueHref = buildRequestMaterialsHref({
    variantId: firstValue(params.variantId) ?? firstValue(params.requestVariant),
    categoryId: firstValue(params.categoryId) ?? firstValue(params.category),
  });

  return (
    <div className="space-y-8">
      <PageHeading
        title="Nuova richiesta materiale"
        description="Inserisci i dati di base della richiesta. Nel passaggio successivo sceglierai i prodotti."
      />
      <RequestHeaderForm continueHref={continueHref} />
    </div>
  );
}
