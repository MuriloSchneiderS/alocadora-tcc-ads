import Header from "../components/Header";
{/*Publicacao:
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
*/}
export default function Exibicao() {
    return (
        <div>
            <Header />
            <h1>Página de exibição do conteúdo (vídeo, imagem, áudio, texto)</h1>
        </div>
    )
}