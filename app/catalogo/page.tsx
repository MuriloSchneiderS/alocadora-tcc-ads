import Header from "../components/Header";
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
export default function Catalogo() {
    return (
        <div>
            <Header />
            <h1>Catálogo/playlist com diversas publicações que podem ser adquiridas individualmente ou em conjunto com uma assinatura</h1>
        </div>
    )
}