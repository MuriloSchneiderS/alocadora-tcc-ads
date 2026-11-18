import SearchResults from "./SearchResults";

function isFollowList(value: string | undefined): value is "followers" | "following" {
  return value === "followers" || value === "following";
}

//recebe os parâmetros de pesquisa da URL e renderiza o componente SearchResults com a query inicial
export default async function Pesquisa({
  searchParams,//objeto que contém os parâmetros de pesquisa da URL, incluindo a query de pesquisa (q)
}: {
  searchParams: Promise<{
    q?: string | string[];
    channelId?: string | string[];
    list?: string | string[];
  }>;
}) {
  const { q, channelId, list } = await searchParams;
  const initialQuery = Array.isArray(q) ? q[0] ?? "" : q ?? "";
  const initialChannelId = Array.isArray(channelId) ? channelId[0] ?? "" : channelId ?? "";
  const initialList = Array.isArray(list) ? list[0] : list;
  const channelList = initialChannelId && isFollowList(initialList)
    ? { channelId: initialChannelId, list: initialList }
    : undefined;

  return <SearchResults initialQuery={initialQuery} channelList={channelList} />;
}