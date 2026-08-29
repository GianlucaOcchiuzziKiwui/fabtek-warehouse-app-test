import { CatalogManagement } from "@/components/admin/catalog/catalog-management";
import { PageHeading } from "@/components/shared/page-heading";
import { requirePermission } from "@/lib/auth/current-profile";
import {
  AdminCatalogDataError,
  getAdminCatalogFormOptions,
  getAdminCatalogPage,
} from "@/lib/data/admin-catalog";
import { parseAdminCatalogListQuery } from "@/lib/domain/admin-catalog/validation";

type AdminCatalogSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: AdminCatalogSearchParams;
}) {
  await requirePermission("catalog:manage");
  const query = parseAdminCatalogListQuery(await searchParams);

  try {
    const [result, formOptions] = await Promise.all([
      getAdminCatalogPage(query),
      getAdminCatalogFormOptions(query.tab),
    ]);

    return (
      <div className="space-y-8">
        <PageHeading
          title="Gestisci catalogo"
          description="Cerca e organizza categorie, famiglie, componenti e varianti."
        />
        <CatalogManagement query={query} result={result} formOptions={formOptions} />
      </div>
    );
  } catch (error) {
    if (!(error instanceof AdminCatalogDataError)) throw error;

    return (
      <div className="space-y-8">
        <PageHeading
          title="Gestisci catalogo"
          description="Cerca e organizza categorie, famiglie, componenti e varianti."
        />
        <CatalogManagement
          query={query}
          result={null}
          formOptions={{ categories: [], families: [], components: [], unitsOfMeasure: [] }}
          loadError
        />
      </div>
    );
  }
}
