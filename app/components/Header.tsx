"use client";

import Link from "next/link";
import { useAuth } from "../providers";

type HeaderProps = {
  title?: string;
  showSearch?: boolean;
  showPublish?: boolean;
};

export default function Header({ title, showSearch = true, showPublish = true }: HeaderProps) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-20 border-b border-navy/20 bg-cream text-ink">
      <div className="mx-auto grid min-h-12 max-w-[1800px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2 sm:flex sm:gap-4 sm:px-5">
        <Link className="order-1 block w-28 shrink-0 sm:order-0 sm:w-36" href="/" aria-label="Alocadora, página inicial">
          <img src="/assets/logo-dark.png" alt="Alocadora" className="block h-auto w-full" />
        </Link>

        {title && <h1 className="order-3 col-span-2 text-center text-lg font-bold uppercase tracking-tight sm:order-0 sm:flex-1">{title}</h1>}

        {showSearch && (
          <form className="order-4 col-span-2 flex h-8 w-full sm:absolute sm:left-1/2 sm:order-0 sm:col-span-1 sm:w-[min(42rem,38vw)] sm:-translate-x-1/2" role="search">
            <label className="sr-only" htmlFor="site-search">Buscar vídeos</label>
            <input id="site-search" type="search" placeholder="PESQUISAR" className="min-w-0 flex-1 border border-navy bg-panel px-3 py-2 text-xs text-white placeholder:text-cream/70" />
            <button type="submit" className="w-12 bg-navy text-lg text-cream hover:bg-panel" aria-label="Buscar">⌕</button>
          </form>
        )}

        <nav className="order-2 ml-auto flex items-center gap-2 sm:order-0 sm:gap-3" aria-label="Ações da conta">
          {showPublish && 
            <Link className="min-w-0 bg-navy px-2 py-2 text-center text-[10px] font-bold text-cream hover:bg-orange hover:text-navy sm:min-w-40 sm:px-5 sm:text-xs" href="/publicacao">
              PUBLICAR
            </Link>
          }
          <Link className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-navy text-2xl leading-none hover:bg-navy hover:text-cream" 
          href={user ? `/canal/${user.uid}` : "/login"} aria-label={user ? "Abrir meu canal" : "Entrar ou criar conta"}>
            {user ? <img src={user.photoURL ?? "/assets/avatar-placeholder.png"} alt={`Avatar de ${user.displayName ?? "usuário"}`} className="h-full w-full rounded-full object-cover" /> : "👤"}
          </Link>
        </nav>
      </div>
    </header>
  );
}