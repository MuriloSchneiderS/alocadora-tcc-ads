import Link from "next/link";

type HeaderProps = {
  title?: string;
  showSearch?: boolean;
  showPublish?: boolean;
};

export default function Header({ title, showSearch = true, showPublish = true }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-navy/20 bg-cream text-ink">
      <div className="mx-auto flex min-h-12 max-w-[1800px] items-center gap-4 px-3 py-2 sm:px-5">
        <Link className="block w-36 shrink-0" href="/" aria-label="Alocadora, página inicial">
          <img src="/assets/logo.png" alt="Alocadora" className="block h-auto w-full" />
        </Link>

        {title && <h1 className="flex-1 text-center text-lg font-bold uppercase tracking-tight">{title}</h1>}

        {showSearch && (
          <form className="hidden max-w-2xl flex-1 sm:flex" role="search">
            <label className="sr-only" htmlFor="site-search">Buscar vídeos</label>
            <input id="site-search" type="search" placeholder="PESQUISAR" className="min-w-0 flex-1 border border-navy bg-panel px-3 py-2 text-xs text-white placeholder:text-cream/70" />
            <button type="submit" className="w-12 bg-navy text-lg text-cream hover:bg-panel" aria-label="Buscar">⌕</button>
          </form>
        )}

        <nav className="ml-auto flex items-center gap-3" aria-label="Ações da conta">
          {showPublish && <Link className="hidden min-w-40 bg-navy px-5 py-2 text-center text-xs font-bold text-cream hover:bg-orange hover:text-navy sm:block" href="/publicacao">PUBLICAR</Link>}
          <Link className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-navy text-2xl leading-none hover:bg-navy hover:text-cream" href="/painel_controle" aria-label="Abrir perfil">♙</Link>
        </nav>
      </div>
    </header>
  );
}