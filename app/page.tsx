import Header from "./components/Header";

const recommendationsMock = [
    {
        title: "Como criar uma rotina que realmente funciona",
        owner: "Marina Costa",
        ownerTitle: "Criadora de conteúdo",
        thumbnail:
            "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=900&q=80",
        ownerAvatar: "https://i.pravatar.cc/96?img=47",
        duration: "12:48",
    },
    {
        title: "A cidade depois da chuva | curta-metragem",
        owner: "Lucas Andrade",
        ownerTitle: "Diretor independente",
        thumbnail:
            "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=80",
        ownerAvatar: "https://i.pravatar.cc/96?img=12",
        duration: "08:21",
    },
    {
        title: "Receita de domingo: massa fresca em casa",
        owner: "Bia na Cozinha",
        ownerTitle: "Chef e professora",
        thumbnail:
            "https://images.unsplash.com/photo-1556761223-4c4282c73f77?auto=format&fit=crop&w=900&q=80",
        ownerAvatar: "https://i.pravatar.cc/96?img=32",
        duration: "18:05",
    },
    {
        title: "O básico da fotografia com luz natural",
        owner: "Rafa Nunes",
        ownerTitle: "Fotógrafo",
        thumbnail:
            "https://images.unsplash.com/photo-1452780212940-6f5c0d14d848?auto=format&fit=crop&w=900&q=80",
        ownerAvatar: "https://i.pravatar.cc/96?img=11",
        duration: "22:16",
    },
    {
        title: "Sons para trabalhar e entrar no foco",
        owner: "Estúdio Norte",
        ownerTitle: "Produtora musical",
        thumbnail:
            "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80",
        ownerAvatar: "https://i.pravatar.cc/96?img=5",
        duration: "42:30",
    },
    {
        title: "Viagem de trem pelo interior do Brasil",
        owner: "Pé na Estrada",
        ownerTitle: "Canal de viagens",
        thumbnail:
            "https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=900&q=80",
        ownerAvatar: "https://i.pravatar.cc/96?img=25",
        duration: "15:44",
    },
];

export default function Home() {
    return (
        <>
            <Header />
            <main className="home-shell">
                <section className="intro-row">
                    <img src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80" alt="" className="intro-image" />
                    <div className="intro-details">
                        <div className="intro-copy">
                            <h2 className="eyebrow">Novidade</h2>
                            <h1>Iron Lung</h1>
                            <p>
                                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
                                eiusmod tempor incididunt ut labore et dolore magna aliqua.
                            </p>
                        </div>
                        <div className="intro-footer">
                            <div className="purchase-options">
                                <div className="purchase-option">
                                    <span className="price-label">Compre</span>
                                    <button className="price-button" type="button">R$50</button>
                                </div>
                                <div className="purchase-option">
                                    <span className="price-label">Alugue por 7 dias</span>
                                    <button className="price-button" type="button">R$10</button>
                                </div>
                            </div>
                            <div className="owner-info">
                                <div className="owner-copy">
                                    <p className="owner-name">Markiplier</p>
                                    <p className="owner-title">Criador de conteúdo</p>
                                </div>
                                <img src="https://i.pravatar.cc/96?img=47" alt="" className="owner-avatar" />
                            </div>
                        </div>
                    </div>
                </section>

                <div className="content-toolbar">
                    <select className="filter-select" aria-label="filtrar">
                        <option value="recentes">Mais Recentes</option>
                        <option value="populares">Mais populares</option>
                        <option value="avaliados">Mais avaliados</option>
                        <option value="mais-assistidos">Mais assistidos</option>
                    </select>
                </div>

                <section className="video-grid" aria-label="Vídeos recomendados">
                    {recommendationsMock.map((video) => (
                        <article className="video-card" key={video.title}>
                            <a className="thumbnail-link" href="#" aria-label={`Assistir: ${video.title}`}>
                                <img src={video.thumbnail} alt="thumbnail" className="thumbnail" />
                                <span className="duration">{video.duration}</span>
                            </a>
                            <div className="video-details">
                                <h2>{video.title}</h2>
                                <div className="owner-info">
                                    <div className="owner-copy">
                                        <p className="owner-name">{video.owner}</p>
                                        <p className="owner-title">{video.ownerTitle}</p>
                                    </div>
                                    <img src={video.ownerAvatar} alt="Avatar do proprietário" className="owner-avatar" />
                                </div>
                            </div>
                        </article>
                    ))}
                </section>
            </main>
        </>
    );
}