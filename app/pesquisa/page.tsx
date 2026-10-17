import SearchResults from "./SearchResults";

//recebe os parâmetros de pesquisa da URL e renderiza o componente SearchResults com a query inicial
export default async function Pesquisa({
  searchParams,//objeto que contém os parâmetros de pesquisa da URL, incluindo a query de pesquisa (q)
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  return <SearchResults initialQuery={Array.isArray(q) ? q[0] ?? "" : q ?? ""} />;
}