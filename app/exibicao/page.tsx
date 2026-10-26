import Header from "../components/Header";
import PublicationDetail from "./PublicationDetail";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Exibicao({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const publicationId = firstParam(params.publicationId);
  if (publicationId)
    return <PublicationDetail publicationId={publicationId} />;

  return (//se não houver publicationId, exibe uma mensagem de erro
    <div className="min-h-screen bg-ink text-cream">
      <Header />
      <main className="mx-auto max-w-[1800px] px-3 py-3 sm:px-5">
        <div className="mx-auto max-w-3xl py-12 text-center">
          <h1 className="text-2xl text-white">Publicação não encontrada</h1>
          <p className="mt-2 text-sm text-cream/70">Escolha uma publicação para visualizar o conteúdo.</p>
        </div>
      </main>
    </div>
  );
}
