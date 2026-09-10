import Link from "next/link";

export default function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="Alocadora, página inicial">
          <img src="/assets/logo.png" alt="Alocadora" />
        </Link>

        <form className="search-form" role="search">
          <label className="sr-only" htmlFor="site-search">
            Buscar vídeos
          </label>
          <input id="site-search" type="search" placeholder="Buscar" />
          <button type="submit" aria-label="Buscar">
            <span aria-hidden="true">⌕</span>
          </button>
        </form>

        <nav className="header-actions" aria-label="Ações da conta">
          <a className="publish-button" href="#publicar">
            PUBLICAR
          </a>
          <a className="user-button" href="#conta" aria-label="Abrir perfil">
            <span aria-hidden="true">♙</span>
          </a>
        </nav>
      </div>
    </header>
  );
}