import Header from "./components/Header";

const recommendations = [
  {
    title: "Como criar uma rotina que realmente funciona",
    user: "Marina Costa",
    userTitle: "Criadora de conteúdo",
    thumbnail:
      "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=900&q=80",
    avatar: "https://i.pravatar.cc/96?img=47",
    duration: "12:48",
  },
  {
    title: "A cidade depois da chuva | curta-metragem",
    user: "Lucas Andrade",
    userTitle: "Diretor independente",
    thumbnail:
      "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=80",
    avatar: "https://i.pravatar.cc/96?img=12",
    duration: "08:21",
  },
  {
    title: "Receita de domingo: massa fresca em casa",
    user: "Bia na Cozinha",
    userTitle: "Chef e professora",
    thumbnail:
      "https://images.unsplash.com/photo-1556761223-4c4282c73f77?auto=format&fit=crop&w=900&q=80",
    avatar: "https://i.pravatar.cc/96?img=32",
    duration: "18:05",
  },
  {
    title: "O básico da fotografia com luz natural",
    user: "Rafa Nunes",
    userTitle: "Fotógrafo",
    thumbnail:
      "https://images.unsplash.com/photo-1452780212940-6f5c0d14d848?auto=format&fit=crop&w=900&q=80",
    avatar: "https://i.pravatar.cc/96?img=11",
    duration: "22:16",
  },
  {
    title: "Sons para trabalhar e entrar no foco",
    user: "Estúdio Norte",
    userTitle: "Produtora musical",
    thumbnail:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80",
    avatar: "https://i.pravatar.cc/96?img=5",
    duration: "42:30",
  },
  {
    title: "Viagem de trem pelo interior do Brasil",
    user: "Pé na Estrada",
    userTitle: "Canal de viagens",
    thumbnail:
      "https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=900&q=80",
    avatar: "https://i.pravatar.cc/96?img=25",
    duration: "15:44",
  },
];

export default function Home() {
  return (
    <>
      <Header />
      <main className="home-shell">
        <section className="intro-row">
          <div>
            <p className="eyebrow">DESCUBRA NOVAS HISTÓRIAS</p>
            <h1>Recomendações para você</h1>
          </div>
          <button className="filter-button" type="button">
            Mais recentes <span aria-hidden="true">⌄</span>
          </button>
        </section>

        <section className="video-grid" aria-label="Vídeos recomendados">
          {recommendations.map((video) => (
            <article className="video-card" key={video.title}>
              <a className="thumbnail-link" href="#" aria-label={`Assistir: ${video.title}`}>
                <img src={video.thumbnail} alt="" className="thumbnail" />
                <span className="duration">{video.duration}</span>
              </a>
              <div className="video-details">
                <img src={video.avatar} alt="" className="avatar" />
                <div className="video-copy">
                  <h2>{video.title}</h2>
                  <p className="user-name">{video.user}</p>
                  <p className="user-title">{video.userTitle}</p>
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>
    </>
  );
}
