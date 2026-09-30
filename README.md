# Alocadora-TCC-ADS
Plataforma de publicação de conteúdo (vídeos, arte, livros, arquivos diversos…), onde o conteúdo publicado pode ser alugável, comprável ou gratuito com anúncios. Pode ir desde uma biblioteca à um serviço de streaming pessoal a depender de como o criador quiser disponibilizar seu conteúdo.

Protótipo de estrutura:
    Frontend: Next.js (React, TailwindCSS, TypeScript, Vite, React Query, Zustand);
    Backend: Next.js API Routes;
    Autenticação: Firebase Auth; (Google, Email/Senha...);
    Banco de Dados: Firestore (Banco de Dados, url do storage), Cloud Storage(Armazenamento de arquivos);
    Pagamentos: Stripe; (Pagamentos, assinaturas, checkout...)
    Deploy: Vercel (Frontend e Backend);

Firestore:
    usuario/{usuarioId}
        - nome (string)
        - titulo (string)
        - email e senha(firebase auth)
        - avatar (url storage)
    catalogo/{catalogoId}
        - titulo (string)
        - descricao (string)
        - miniatura (url storage)
        - data_criacao (timestamp)
        - criador (usuarioId)
        - publicacoes (array de publicacaoId e posicao no catalogo)
    catalogo/{catalogoId}/monetizacao/{monetizacaoId} (catalogo pode ter várias monetizações, como aluguel, assinatura e compra)
        - tipo (enum: aluguel, compra, assinatura, gratuito)
        - preco (number)
        - duracao (number, em dias, caso seja aluguel ou assinatura)
        - ativo (boolean)
    publicacao/{publicacaoId}
        - titulo (string)
        - descricao (string)
        - tipo (enum: video(webm), imagem(webp), audio(mp3), livro(epub))
        - tamanho (number)
        - miniatura (url storage)
        - arquivo (url storage)
        - data_criacao (timestamp)
        - duracao (number, em segundos, caso seja video ou audio)
        - catalogos (array de catalogoId e posicao no catalogo) (catalogos em que está)
        - criador (usuarioId)
    publicacao/{publicacaoId}/monetizacao/{monetizacaoId} (publicacao pode ter várias monetizações, como gratuito, aluguel e compra)
        - tipo (enum: aluguel, compra, assinatura, gratuito)
        - preco (number)
        - duracao (number, em dias, caso seja aluguel ou assinatura)
        - ativo (boolean)
    acesso/{usuarioId}/{publicacaoId}
        - usuario (usuarioId)
        - conteudo (publicacaoId)
        - tipo (enum: aluguel, compra, assinatura)
        - comprado_em (timestamp)
        - expira_em (timestamp, caso seja aluguel ou assinatura)
        - ativo (boolean)
        - transacao (transacaoId)
    transacao/{transacaoId}
        - comprador (usuarioId)
        - vendedor (usuarioId)
        - publicacao (publicacaoId)
        - catalogo (catalogoId)
        - tipo (enum: aluguel, compra, assinatura)
        - comprado_em (timestamp)
        - expira_em (timestamp, caso seja aluguel ou assinatura)
        - hash (stripe checkout session id)

    O fluxo de publicação envia os arquivos diretamente do navegador ao Firebase Storage e grava suas URLs no Firestore.

