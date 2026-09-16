import Header from "../components/Header";
import MediaCard from "../components/MediaCard";
{/*Catalogo:
    id,
    titulo,
    descricao,
    miniatura(miniatura da primeira publicação do catálogo (link dostorage)),
    data_criacao,
    publicacoes: [
        {
            id,
            titulo,
            descricao,
            miniatura(miniatura da publicação (link do storage)),
            link_publicacao(link do storage)
            data_criacao,
            duracao,
            usuario_id,
            monetizacoes: [
                {
                    id,
                    tipo(mensalidade, compra avulsa, doação),
                    preco
                }
            ]
        }
    ]
*/}
const episodeNames = [
    "O incrível circo digital - PILOTO",
    "Desespero no Desfiladeiro Doce!",
    "O Mistério da Mansão Mildenhall",
    "UM DIA A MÁSCARA CAI",
    "Sem Título",
    "Todos ganham armas",
    "Episódio de Praia",
    "j-ishkdfldc",
    "O incrível circo digital - O Último Ato",
];

const episodes = episodeNames.map((title, index) => ({
    title: `${index + 1} - ${title}`,
    image: `https://images.unsplash.com/photo-${["1518611012118-696072aa579a", "1500530855697-b586d89ba3ee", "1497366754035-f200968a6e72", "1500534314209-a25ddb2bd429", "1531058020387-3be344556be6", "1519608487953-e999c86e7455", "1472162072942-cd5147eb3902", "1514525253161-7a46d19cd819", "1485846234645-a62644f84728"][index]}?auto=format&fit=crop&w=500&q=80`,
    channel: { name: "Glitch", title: "Estúdio de animação", avatar: "https://i.pravatar.cc/96?img=31" },
}));
export default function Catalogo() {
    return (
        <div>
            <Header />
                <main className="mx-auto grid max-w-[1800px] gap-3 px-3 py-3 lg:grid-cols-[1fr_1fr] sm:px-5">
                    <section className="space-y-2 pr-0 lg:pr-1" aria-label="Publicações do catálogo">
                        {episodes.map((episode) => <MediaCard key={episode.title} {...episode} variant="row" meta="Descrição da publicação e informações sobre este episódio do catálogo." />)}
                    </section>
                    <aside className="flex flex-col justify-between border border-white/10 bg-panel p-3 sm:p-5">
                        <div className="grid gap-5 md:grid-cols-[180px_1fr]">
                            <div>
                                <img src="https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=500&q=80" alt="Capa do catálogo O Incrível Circo Digital" className="aspect-[3/4] w-full object-cover" />
                                <p className="bg-ink py-1 text-center">9 episódios</p>
                            </div>
                            <div className="text-center text-sm leading-relaxed text-cream/85">
                                <h1 className="mb-3 text-xl text-white">O Incrível Circo Digital</h1>
                                <p>Uma comédia sombria e psicológica sobre personagens de desenho animado fofos que odeiam suas vidas e querem ir embora.</p>
                                <p className="mt-4">A série acompanha um grupo de humanos presos dentro de uma simulação de realidade virtual com temática circense.</p>
                                <span className="mt-6 inline-block bg-[#e88b2c] px-4 py-2 text-4xl font-bold text-white">14</span>
                            </div>
                        </div>
                        <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
                            {["Compre|R$50", "Assine por 30 dias|R$10", "Alugue por 7 dias|R$5"].map((option) => {
                                const [label, price] = option.split("|");
                                return <div key={label} className="text-center"><p className="text-sm">{label}</p><button type="button" className="min-w-28 border border-white/10 bg-ink px-4 py-1 hover:bg-gold hover:text-navy">{price}</button></div>;
                            })}
                            <div className="text-right"><p className="text-lg">GLITCH</p><p className="text-sm text-cream/70">Estúdio de animação</p></div>
                        </div>
                    </aside>
                </main>
        </div>
    )
}