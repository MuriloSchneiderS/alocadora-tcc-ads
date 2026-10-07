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

    Para futuras APIs de perfil e edição de publicação, reutilize `authenticateFirebaseRequest`, derive o proprietário de `user.uid` e mantenha validação de campos e regras de propriedade no Firestore. Não aceite `uid` do cliente como prova de identidade. As regras atuais negam escrita em `acesso` e `transacao`; essas gravações devem ficar num backend privilegiado, por exemplo uma Cloud Function/webhook Stripe que valide a confirmação do pagamento. Isso exigirá uma identidade de serviço adequada ao ambiente de deploy, mas não exige usar gcloud no desenvolvimento do cliente.
