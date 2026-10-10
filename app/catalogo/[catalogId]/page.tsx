import CatalogDetail from "../CatalogDetail";

export default async function CatalogoPorId({ params }: { params: Promise<{ catalogId: string }> }) {
  const { catalogId } = await params;
  return <CatalogDetail catalogId={catalogId} />;
}