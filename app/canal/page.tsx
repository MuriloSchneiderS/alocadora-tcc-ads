import Header from "../components/Header";
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
            <h1>Página de visualização do canal do criador de conteúdo</h1>
        </div>
    )
}