import Header from "../components/Header";
{/*Usuario(integrado com firebase auth): 
    id,
    nome,
    titulo,
    email,
    senha,
    avatar(imagem>link do storage)
*/}
export default function PainelControle() {
    return (
        <div>
            <Header />
            <h1>Página de painel de controle do canal (criador de conteúdo)</h1>
        </div>
    )
}