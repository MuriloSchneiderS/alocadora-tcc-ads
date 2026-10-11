# Alocadora-TCC-ADS
Plataforma de publicação de conteúdo (vídeos, arte, livros, arquivos diversos…), onde o conteúdo publicado pode ser alugável, comprável ou gratuito com anúncios. Pode ir desde uma biblioteca à um serviço de streaming pessoal a depender de como o criador quiser disponibilizar seu conteúdo.

Protótipo de estrutura:
    Frontend: Next.js (React, TailwindCSS, TypeScript, Vite, React Query, Zustand);
    Backend: Next.js API Routes;
    Autenticação: Firebase Auth; (Google, Email/Senha...);
    Banco de Dados: Firestore (Banco de Dados, url do storage), Cloud Storage(Armazenamento de arquivos);
    Pagamentos: Stripe; (Pagamentos, assinaturas, checkout...)
    Deploy: Vercel (Frontend e Backend);
## Estrutura do Banco de Dados
### Firestore:
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
        - tipo (enum: aluguel, compra, assinatura, gratuito) (aluguel 7 dias e assinatura 30 de acesso, compra perpétuo e permite download)
        - preco (number)
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
        - tipo (enum: aluguel, compra, assinatura, gratuito) (aluguel 7 dias e assinatura 30 de acesso, compra perpétuo e permite download)
        - preco (number)
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

### Storage:
    O fluxo de publicação envia os arquivos diretamente do navegador ao Firebase Storage. Os objetos ficam em:
        publicacoes/arquivos/{usuarioId}/{publicacaoId}/{arquivo}
        publicacoes/miniaturas/{usuarioId}/{publicacaoId}/{miniatura}
    O campo publicacao.arquivo guarda o caminho do objeto, nunca uma URL com token de download. As miniaturas são cópias reduzidas e podem ser públicas.

## Backend
### API do Next.js

    O backend HTTP usa Route Handlers do App Router em `app/api`:

    - Login e cadastro continuam no SDK cliente Firebase. `GET /api/auth` valida o ID token enviado como Bearer e retorna `uid`, e-mail e nome do usuário autenticado.
    - `lib/firebase-auth-server.ts` centraliza validação do ID token e obtenção do `uid`; cada endpoint protegido deve chamá-lo e usar o `uid` retornado, nunca um ID enviado no corpo.
    - `POST /api/content` reutiliza o autenticador e encaminha gravações ao Firestore REST com o token do usuário. As regras Firestore continuam autorizando cada gravação.

    Nenhuma credencial Firebase Admin/service account é necessária para login, consulta de sessão ou publicação. Os endpoints usam `NEXT_PUBLIC_FIREBASE_API_KEY` e `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, já fornecidos pela configuração Firebase do cliente; o token do usuário e as regras do Firestore controlam a autorização.

    APIs de perfil e edição de publicação utilizam `authenticateFirebaseRequest`, deriva o proprietário de `user.uid` e mantem validação de campos e regras de propriedade no Firestore. 
    Não aceita `uid` do cliente como prova de identidade. As regras atuais negam escrita em `acesso` e `transacao`; essas gravações devem ficar num backend privilegiado, por exemplo uma webhook que valide a confirmação do pagamento. Isso exigirá uma identidade de serviço adequada ao ambiente de deploy, mas não exige usar gcloud no desenvolvimento do cliente.

### Gateway de Pagamento Abacate Pay
    O Abacate Pay cobre nativamente os formatos de venda planejados através dos endpoints POST /products/create e gerenciamento de cobranças:
        • Compra Avulsa & Aluguel: Ambos são tratados como cobranças únicas baseadas em produtos (metadata ou externalId). A diferença do Aluguel (7 dias) não muda o pagamento em si, mas sim a sua lógica de Backend: quando o webhook do Abacate Pay avisar que foi pago, o Firebase grava um timestamp dataExpiracao: agora + 7 dias no documento de acesso do usuário.
        • Assinatura (30 dias): O Abacate Pay possui endpoints dedicados para cobrança recorrente (POST /subscriptions/create). Ele lida com os ciclos automáticos de cobrança a cada 30 dias.
        • Gratuito: Ignora o ecossistema do gateway e apenas libera o acesso direto no Firestore. (o usuário ainda pode pagar através da página de exibição se quiser)

    1.Ação do Usuário: O criador preenche o formulário da publicação (título, preço, tipo de monetização) no Frontend.
    2.Camada Segura (Next.js API Route): O Frontend envia os dados para uma Rota de API do Next.js (nunca direto do cliente para o Abacate Pay para não expor as chaves de API secretas).
    3.Criação em Paralelo:
        • A rota cria o documento na coleção publicacao no Firestore.
        • A mesma rota dispara um fetch ou usa o SDK Node da Abacate Pay para criar o produto no gateway.
    4.Vinculação: O ID do produto retornado pelo Abacate Pay é salvo dentro da subcoleção monetizacoes do Firestore. Quando outro usuário clicar em "Adquirir", você gera um checkout (POST /checkouts/create) usando esse ID de produto.

    ⚠️ O recurso de Split de Pagamento Automático (onde o gateway divide o Pix na hora, mandando por exemplo 90% para o criador e 10% de taxa para a sua plataforma) está listado como "Em Breve" na Abacate Pay.
    Enquanto o split nativo não é lançado:
        Transferência Manual / Payout Automatizado: Todo o dinheiro cai na conta bancária da plataforma. Mantém um saldo no Firestore de quanto cada criador acumulou. Mensalmente ou semanalmente, a rota de transferências via API da Abacate Pay (POST /pix/send) é usada para enviar os valores em lote para a chave Pix dos criadores.
    Ou
        [Usuário paga R$ 50]
                ↓
        [AbacatePay recebe R$ 50 na sua conta]
                ↓
        [Backend calcula: R$ 42,50 para criador + R$ 7,50 para você]
                ↓
        [Cria withdraw de R$ 42,50 para chave PIX do criador]
