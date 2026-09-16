import Header from "../components/Header";
import MediaCard from "../components/MediaCard";

const channelVideos: [string, string, string][] = [
    ["Gruvi & Melancolia: O Documentário", "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80", "6 partes"],
    ["Gruvi & Melancolia", "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=600&q=80", "18 áudios"],
    ["Semper Soma - Gruvi & Melancolia", "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=600&q=80", "1:01"],
    ["Semper Soma - Ser renascer", "https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=600&q=80", "4:07"],
    ["Semper Soma - Sobre nós", "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=600&q=80", "4:26"],
    ["Semper Soma - Cidade em Verso", "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=600&q=80", "2:58"],
    ["Chame como quiser", "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=600&q=80", "9 áudios"],
    ["Semper Soma - Cidade em Verso (Clipe)", "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80", "3:21"],
];

{/*Usuario(integrado com firebase auth): 
    id,
    nome,
    titulo,
    email,
    senha,
    avatar(imagem>link do storage)
*/}
export default function Canal(){
    return (
        <div>
            <Header />
                <main className="mx-auto max-w-[1800px] px-3 py-2 sm:px-5">
                    <section className="border border-white/10 bg-panel p-3 sm:p-4">
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                            <p className="max-w-3xl whitespace-pre-line text-sm leading-tight text-cream/85">
                                {"Semper Soma é uma banda formada em meados de 2016 em Araras, interior de São Paulo.\nA proposta do projeto é fazer música sincera e sem rótulos, visando somar vários ritmos e influências nas canções.\nCom um álbum, três EP&apos;s e diversos singles na bagagem, a banda trabalha agora em Gruvi & Melancolia."}
                            </p>
                            <div className="flex items-center gap-4 lg:min-w-96 lg:justify-end">
                                <div className="text-right">
                                    <h2 className="text-3xl text-white">Semper Soma</h2>
                                    <p className="text-2xl text-cream/90">Banda</p>
                                    <button type="button" className="mt-2 w-full border border-gold/30 bg-panel-muted px-8 py-1 text-xl text-white hover:bg-gold hover:text-navy">Seguir</button>
                                    <p className="text-right text-sm">899 seguidores</p>
                                    <p className="text-right text-sm">53 publicações</p>
                                </div>
                                <img src="https://i.pravatar.cc/160?img=13" alt="Avatar de Semper Soma" className="h-24 w-24 rounded-full object-cover" />
                            </div>
                        </div>
                    </section>

                    <nav className="mt-1 flex border-b border-white/15" aria-label="Seções do canal">
                        <a href="#inicio" className="bg-cream px-10 py-2 text-lg text-ink">Início</a>
                        <a href="#publicacoes" className="border-r border-white/15 px-5 py-2 text-lg hover:bg-panel">Publicações</a>
                        <a href="#catalogos" className="border-r border-white/15 px-5 py-2 text-lg hover:bg-panel">Catálogos</a>
                        <input className="ml-1 hidden flex-1 bg-transparent px-3 text-xs placeholder:text-cream/60 sm:block" placeholder="PESQUISAR" aria-label="Pesquisar no canal" />
                    </nav>

                    <section className="grid grid-cols-2 gap-4 py-2 md:grid-cols-3 lg:grid-cols-4" aria-label="Publicações do canal">
                        {channelVideos.map(([title, image, meta]) => <MediaCard key={title} title={title} image={image} meta={meta} channel={{ name: "Semper Soma", title: "Banda", avatar: "https://i.pravatar.cc/96?img=13" }} />)}
                    </section>
                </main>
        </div>
    )
}