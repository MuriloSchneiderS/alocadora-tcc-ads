# Alocadora-TCC-ADS
Trabalho de Conclusão de Curso (TCC) do curso de Análise e Desenvolvimento de Sistemas (ADS) do Instituto Federal de Santa Catarina (IFSC).
Plataforma de publicação de conteúdo (vídeos, arte, livros, arquivos diversos…), onde o conteúdo publicado pode ser alugável, comprável ou gratuito com anúncios. Pode ir desde uma biblioteca à um serviço de streaming pessoal a depender de como o criador quiser disponibilizar seu conteúdo.

Disponível em: alocadora-tcc-ads.vercel.app

Protótipo de estrutura:
    Frontend: Next.js (React, TailwindCSS, TypeScript, Vite, React Query, Zustand);
    Backend: Next.js App Router/API Routes;
    Autenticação: Firebase Auth; (Email/Senha...);
    Banco de Dados: Firebase Firestore (Banco de Dados, url do storage) & Cloud Storage(Armazenamento de arquivos);
    Pagamentos: Abacate Pay (sandbox); (checkout, Pix/cartão, assinaturas de catálogo...)
    Transcodificação de arquivos: FFmpeg (geração de miniaturas, conversão para formatos padronizados e compressão);
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
    - publicacoes (array de publicacaoId e posicao no catalogo(id do array))
    - avaliacao (media das avaliações, calculada pelo servidor)
catalogo/{catalogoId}/monetizacao/{monetizacaoId}
    - tipo (enum: aluguel, compra, assinatura, gratuito) (aluguel 7 dias; assinatura mensal; compra perpétua)
    - preco (number)
    - ativo (boolean)
    - moeda
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
    - avaliacao (media das avaliações, calculada pelo servidor)
publicacao/{publicacaoId}/monetizacao/{monetizacaoId} (publicação pode ter gratuito, aluguel ou compra)
    - tipo (enum: aluguel, compra, gratuito) (aluguel 7 dias; compra perpétua e permite download)
    - preco (number)
    - ativo (boolean)
avaliacao/{avaliacaoId}
    - usuario (usuarioId)
    - publicacao (publicacaoId, quando a avaliação for de uma publicação; ausente para catálogo)
    - catalogo (catalogoId, quando a avaliação for de um catálogo; ausente para publicação)
    - nota (inteiro de 1 a 5)
    - comentario (string, até 1000 caracteres)
    - data_criacao (timestamp)

acesso/{usuarioId}/publicacoes/{publicacaoId}
    - ativo (boolean, resumo calculado pelo servidor a partir das concessões)
    - expira_em (timestamp ou null para acesso perpétuo)
    - fontes/{fonteId} (concessão individual; somente backend pode ler/escrever)
transacao/{transacaoId}
    - comprador (usuarioId)
    - vendedor (usuarioId)
    - origem_tipo e origem_id (publicacao ou catalogo)
    - publicacoes (ids cobertos pela aquisição)
    - tipo (aluguel, compra ou assinatura)
    - preco (centavos), moeda (BRL), status
    - checkout_id (ID retornado pela Abacate Pay)
    - comprado_em e expira_em (quando aplicável)
assinatura/{subscriptionId} (metadados internos, somente API autenticada)
    - usuario
    - vendedor 
    - catalogo
    - publicacoes
    - preco
    - ciclo (mensal, trimestral, anual)
    - status
    - expira_em
produto_gateway/{chave} e eventos_pagamento/{hashEvento}
    - cache de produtos/ciclos e controle idempotente de webhooks (somente servidor)

### Storage:
O fluxo de publicação envia os arquivos diretamente do navegador ao Firebase Storage. Os objetos ficam em:
    publicacoes/arquivos/{usuarioId}/{publicacaoId}/{arquivo.ext}
    publicacoes/miniaturas/{usuarioId}/{publicacaoId}/{miniatura.webp}
    usuarios/{usuarioId}/{avatar.webp}
No Firestore o campo publicacao arquivo e miniatura guardam o caminho dos objetos no Storage. 
As miniaturas podem ser enviadas pelo usuário (convertida para webp e comprimida),
ou gerada automaticamente (primeiro frame/página/imagem).

## Backend
### API do Next.js

O backend HTTP usa Route Handlers do App Router em 'app/api':

- Login e cadastro continuam no SDK cliente Firebase. 'GET /api/auth' valida o ID token enviado como Bearer e retorna 'uid', e-mail e nome do usuário autenticado.
- 'lib/firebase-auth-server.ts' centraliza validação do ID token e obtenção do 'uid'; cada endpoint protegido deve chamá-lo e usar o 'uid' retornado, nunca um ID enviado no corpo.
- 'POST /api/content' reutiliza o autenticador e encaminha gravações ao Firestore REST com o token do usuário. As regras Firestore continuam autorizando cada gravação.

Firebase Admin: as variáveis 'NEXT_PUBLIC_FIREBASE_*' do '.env' configuram o SDK web e não concedem privilégios administrativos. Login e publicação padrão usam o ID token do usuário e as regras do Firestore. Firebase Admin opera somente no servidor para que checkout e webhooks gravem concessões e transações confiáveis; por isso, ela exige também uma credencial de conta de serviço, guardada em variáveis secretas locais/Vercel.

APIs protegidas usam 'authenticateFirebaseRequest', derivam o proprietário de 'user.uid' e não aceitam UID enviado no corpo como prova de identidade. As regras negam escrita do cliente em concessões, transações, assinaturas, cache de produtos e eventos de webhook.

- 'POST /api/payments/checkout' verifica a monetização e seu preço no Firestore, cria/reusa produto no gateway e retorna uma URL de Checkout.
- 'POST /api/webhooks/abacatepay' valida o segredo compartilhado e a assinatura HMAC v2 antes de registrar pagamento e liberar acesso.
- 'GET /api/payments/dashboard' devolve dados do próprio usuário; 'POST /api/payments/subscriptions/cancel' interrompe a recorrência sem antecipar o fim do acesso já pago.

### Pagamentos

O comprador escolhe uma publicação ou catálogo e inicia o checkout da Abacate Pay. O servidor confirma o preço no Firestore e, após receber um webhook válido de pagamento, registra a transação e libera o acesso.

Publicações e catálogos podem ser gratuitos ou pagos. Aluguéis dão acesso temporário, compras avulsas são permanentes e assinaturas de catálogo renovam mensalmente. Arquivos pagos continuam privados enquanto o usuário não tiver uma concessão válida. O painel de controle reúne compras, vendas, monetizações e assinaturas; ao cancelar uma assinatura, o acesso continua até o fim do período pago.

As gravações de pagamento e permissões usam Firebase Admin somente no servidor; suas credenciais administrativas não são expostas ao navegador. Os pagamentos são recebidos pela plataforma, sem divisão automática de valores entre criadores.

#### Fluxo da aquisição

    1: Na página da publicação, o component AcquisitionOptions.tsx envia uma requisição autenticada para /api/payments/checkout.

    2: O endpoint valida o usuário, a publicação ou catálogo, a monetização e o preço. 
    Publicações antigas ou opções indisponíveis falham nessa etapa, antes de criar uma transação.

    3: lib/payment-products.ts procura ou provisiona o produto na Abacate Pay. 
    O registro produto_gateway é um cache reutilizável que permanece no Firestore mesmo se a etapa seguinte falhar, mas não representa uma compra nem concede acesso.

    4: A Abacate Pay cria o checkout. Em api/payments/checkout/route.ts, o documento transacao só é criado depois que a criação do checkout retorna sucesso; ele já recebe o ID e a URL do checkout.
    
    5: O endpoint devolve a URL e o navegador redireciona o comprador. 
    Se a criação do checkout falhar, não é criado um documento transacao.
    
    6: Depois do pagamento, o webhook valida a assinatura, evita processar o mesmo evento duas vezes e localiza a transação. 
    Em pagamento confirmado, registra o acesso em acesso e marca a transação como pago; aluguel expira conforme a duração. Assinaturas passam pela confirmação e pelos eventos próprios de assinatura.

### Avaliações

As avaliações de publicações e catálogos são armazenadas na coleção global 'avaliacao'. Cada usuário pode manter uma nota de 1 a 5 e um comentário por conteúdo. O usuário não grava nessa coleção nem altera a média diretamente: a API valida a identidade e os dados e usa Firebase Admin no servidor para salvar a avaliação e atualizar o campo 'avaliacao' do documento de publicação ou catálogo.

#### Fluxo da avaliação

    1: O componente Reviews.tsx solicita 'GET /api/ratings/{targetType}/{targetId}' para carregar a média, a quantidade de avaliações, as 20 avaliações mais recentes e, quando há sessão autenticada, a avaliação do próprio usuário.

    2: 'targetType' aceita 'publication' ou 'catalog'. A API consulta 'avaliacao' pelo campo correspondente ('publicacao' ou 'catalogo') e lê a média armazenada no documento-alvo. Se ainda não houver média persistida, calcula uma média de contingência a partir das notas válidas.

    3: Para publicar ou atualizar uma avaliação, o cliente envia 'POST' para o mesmo caminho, com o ID token Firebase no cabeçalho Bearer e um corpo contendo 'rating' (inteiro de 1 a 5) e 'comment' (até 1000 caracteres). O servidor deriva 'usuario' do token, não aceita um UID fornecido pelo cliente.

    4: O servidor cria uma transação Firestore, confirma que o conteúdo existe e consulta as avaliações daquele conteúdo. Soma as notas válidas, exclui a nota anterior do usuário que está avaliando novamente e inclui a nova nota. A média é arredondada para uma casa decimal.

    5: Na mesma transação, a API grava ou atualiza 'avaliacao/{avaliacaoId}' e atualiza 'publicacao/{publicacaoId}.avaliacao' ou 'catalogo/{catalogoId}.avaliacao'. Assim, alterar a própria avaliação substitui a nota e o comentário anteriores em vez de criar uma segunda avaliação.

    6: A interface atualiza a lista e exibe estrelas fracionadas com base na média. Por exemplo, '4.5' é mostrado como quatro estrelas e meia. Com zero avaliações, a média exibida é zero e nenhum valor médio precisa ser persistido.

Os documentos de publicação mantêm o formato de ID já usado antes da unificação da API, para que as avaliações existentes continuem associadas ao mesmo usuário e publicação. Para catálogos, o ID também inclui o tipo do alvo, evitando colisões com avaliações de publicação. Os campos 'publicacao' e 'catalogo' são mutuamente exclusivos em cada documento de avaliação.
