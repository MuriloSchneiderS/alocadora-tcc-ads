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
    usuario/{usuarioId} (documento público do canal; o ID é o UID do Firebase Auth)
        - nome (string)
        - titulo (string)
        - descricao (string)
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
        - duracao (number inteiro, em dias para aluguel ou assinatura)
        - ativo (boolean)
    publicacao/{publicacaoId}
        - titulo (string)
        - descricao (string)
        - tipo (enum: video(webm), imagem(webp), audio(mp3), livro(epub))
        - tamanho (number)
        - miniatura (url storage)
        - arquivo (caminho do objeto privado no Storage, não URL de download)
        - data_criacao (timestamp)
        - duracao (number, em segundos, caso seja video ou audio)
        - catalogos (array de catalogoId e posicao no catalogo) (catalogos em que está)
        - criador (usuarioId)
    publicacao/{publicacaoId}/monetizacao/{monetizacaoId} (publicacao pode ter várias monetizações, como gratuito, aluguel e compra)
        - tipo (enum: aluguel, compra, assinatura, gratuito)
        - preco (number)
        - duracao (number inteiro, em dias quando configurada para aluguel)
        - ativo (boolean)
    acesso/{usuarioId}/publicacoes/{publicacaoId}
        - usuario (usuarioId)
        - conteudo (publicacaoId)
        - tipo (enum: aluguel, compra, assinatura)
        - origem_tipo (enum: publicacao, catalogo)
        - origem_id (publicacaoId ou catalogoId comprado)
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

    O fluxo de publicação envia os arquivos diretamente do navegador ao Firebase Storage. Os objetos ficam em:
        publicacoes/arquivos/{usuarioId}/{publicacaoId}/{arquivo}
        publicacoes/miniaturas/{usuarioId}/{publicacaoId}/{miniatura}
    O campo publicacao.arquivo guarda o caminho do objeto, nunca uma URL com token de download. As miniaturas são cópias reduzidas e podem ser públicas.

    Direitos e pagamentos:
        - As subcoleções acesso/{usuarioId}/publicacoes/{publicacaoId} e transacao/{transacaoId} são escritas exclusivamente por backend confiável usando Firebase Admin SDK.
        - Após confirmar o pagamento no webhook Stripe, o backend grava a transação e cria um direito por publicação em acesso. Compra, aluguel ou assinatura de catálogo gera direitos para cada publicação incluída naquele momento.
        - Aluguel e assinatura devem preencher expira_em; compra sem expiração usa null ou omite o campo. Direitos expirados ou com ativo=false não autorizam leitura.
        - A tela de publicação atual não define duração de aluguel. Antes de habilitar checkout de aluguel direto, defina uma duração padrão no backend ou adicione a duração à publicação e valide-a nas regras.
        - Para acesso gratuito, a publicação deve ter publicacao/{publicacaoId}/monetizacao/gratuito com ativo=true e preco=0. O ID do documento de monetização é o tipo (gratuito, aluguel ou compra), para que as regras consigam verificar a modalidade sem consulta de coleção.
        - A criação atual de publicação grava IDs determinísticos e ativo=true. O checkout, webhook Stripe e geração de direitos ainda precisam ser implementados no backend; não permita que o cliente escreva acesso ou transacao.
        - Não use getDownloadURL() para arquivos pagos/privados: URLs com token funcionam como links bearer e não são protegidas pelas regras de leitura do Storage. Para servir conteúdo pago, use o SDK autenticado de Storage (por exemplo getBlob/getBytes) ou um backend que valide o direito antes de transmitir o arquivo.
        - Publicações e arquivos enviados antes desta mudança usam IDs de monetização aleatórios, caminhos antigos e podem ter URLs com token já emitidas. Migre os documentos/arquivos e remova ou rotacione tokens antigos antes de considerar o conteúdo legado protegido; o deploy das regras não faz essa migração.

