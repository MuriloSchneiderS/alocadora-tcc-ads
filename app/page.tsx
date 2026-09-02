const features = [
  {
    title: "Catálogo de conteúdos",
    description: "Organize vídeos, ebooks, arquivos e obras em uma vitrine simples e acessível.",
  },
  {
    title: "Locação e compra",
    description: "Permita aluguel, venda direta ou acesso gratuito com anúncios conforme o tipo de conteúdo.",
  },
  {
    title: "Gestão do criador",
    description: "Centralize uploads, controle de disponibilidade e organização do material publicado.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-20">
        <div className="mb-10 inline-flex w-fit items-center rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300">
          Projeto em desenvolvimento
        </div>

        <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Alocadora TCC ADS
            </p>
            <h1 className="max-w-xl text-4xl font-bold leading-tight text-white md:text-6xl">
              Publicação digital com aluguel, compra e acesso fácil.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-slate-300">
              Uma plataforma para criadores compartilharem conteúdo de forma organizada,
              com opções de locação, compra e distribuição pública ou privada.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="#funcionalidades"
                className="rounded-full bg-cyan-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Ver funcionalidades
              </a>
              <a
                href="#"
                className="rounded-full border border-slate-700 px-6 py-3 font-semibold text-white transition hover:border-slate-500 hover:bg-slate-900"
              >
                Explorar demo
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-cyan-950/30">
            <div className="rounded-2xl bg-gradient-to-br from-cyan-500/20 via-slate-900 to-purple-500/20 p-5">
              <div className="mb-6 flex items-center justify-between text-sm text-slate-300">
                <span>Resumo do projeto</span>
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-emerald-300">
                  Online
                </span>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-slate-950/70 p-4">
                  <p className="text-sm text-slate-400">Conteúdos ativos</p>
                  <p className="mt-2 text-3xl font-bold text-white">128</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-slate-950/70 p-4">
                    <p className="text-sm text-slate-400">Locações</p>
                    <p className="mt-2 text-2xl font-bold text-cyan-300">42</p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/70 p-4">
                    <p className="text-sm text-slate-400">Vendas</p>
                    <p className="mt-2 text-2xl font-bold text-purple-300">19</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="funcionalidades" className="mx-auto max-w-6xl px-6 pb-20">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Funcionalidades
          </p>
          <h2 className="mt-3 text-3xl font-bold text-white">Estrutura inicial da plataforma</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
            >
              <div className="mb-4 h-12 w-12 rounded-xl bg-cyan-500/15 text-xl grid place-items-center">
                ✦
              </div>
              <h3 className="mb-3 text-xl font-semibold text-white">{feature.title}</h3>
              <p className="text-slate-300">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
