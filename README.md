# Alocadora-TCC-ADS
Trabalho de Conclusão de Curso (TCC) do curso de Análise e Desenvolvimento de Sistemas (ADS) do Instituto Federal de Santa Catarina (IFSC).<br />
Plataforma de publicação de conteúdo (vídeos, arte, livros, arquivos diversos…), onde o conteúdo publicado pode ser alugável, comprável ou gratuito com anúncios(ainda não adicionados). Pode ir desde uma biblioteca à um serviço de streaming pessoal a depender de como o criador quiser disponibilizar seu conteúdo.

Disponível em: alocadora-tcc-ads.vercel.app

Protótipo de estrutura:<br />
    Frontend: Next.js (React, TailwindCSS, TypeScript, Vite, React Query, Zustand);<br />
    Backend: Next.js App Router/API Routes;<br />
    Autenticação: Firebase Auth; (Email/Senha...);<br />
    Banco de Dados: Firebase Firestore (Banco de Dados, url do storage) & Cloud Storage(Armazenamento de arquivos);<br />
    Pagamentos: Abacate Pay (sandbox); (PIX para compras e aluguéis, cartão para assinaturas de catálogo...)<br />
    Transcodificação de arquivos: FFmpeg (geração de miniaturas, conversão para formatos padronizados e compressão);<br />
    Deploy: Vercel (Frontend e Backend);<br />

## Estrutura do Banco de Dados
### Indices
storageReservations: status, expiresAt, __name__ <br />
publicacao: criador, data_criacao, __name__ <br />
catalogo: criador, data_criacao, __name__<br />
### Firestore:
usuario/{usuarioId} (documento público do canal; o ID é o UID do Firebase Auth)<br />
____- nome (string)<br />
____- titulo (string)<br />
____- descricao (string)<br />
____- avatar (url storage)<br />
catalogo/{catalogoId}<br />
____- titulo (string)<br />
____- descricao (string)<br />
____- miniatura (url storage)<br />
____- data_criacao (timestamp)<br />
____- criador (usuarioId)<br />
____- publicacoes (array de publicacaoId e posicao no catalogo(id do array))<br />
____- avaliacao (media das avaliações, calculada pelo servidor)<br />
catalogo/{catalogoId}/monetizacao/{monetizacaoId}<br />
____- tipo (enum: aluguel, compra, assinatura, gratuito) (aluguel 7 dias; assinatura mensal; compra perpétua)<br />
____- preco (number)<br />
____- ativo (boolean)<br />
____- moeda<br />
publicacao/{publicacaoId}<br />
____- titulo (string)<br />
____- descricao (string)<br />
____- tipo (enum: video(webm), imagem(webp), audio(mp3), livro(epub))<br />
____- tamanho (number)<br />
____- miniatura (url storage)<br />
____- arquivo (caminho do objeto privado no Storage, não URL de download)<br />
____- data_criacao (timestamp)<br />
____- duracao (number, em segundos, caso seja video ou audio)<br />
____- catalogos (array de catalogoId e posicao no catalogo) (catalogos em que está)<br />
____- criador (usuarioId)<br />
____- avaliacao (media das avaliações, calculada pelo servidor)<br />
publicacao/{publicacaoId}/monetizacao/{monetizacaoId} (publicação pode ter gratuito, aluguel ou compra)<br />
____- tipo (enum: aluguel, compra, gratuito) (aluguel 7 dias; compra perpétua e permite download)<br />
____- preco (number)<br />
____- ativo (boolean)<br />
avaliacao/{avaliacaoId}<br />
____- usuario (usuarioId)<br />
____- publicacao (publicacaoId, quando a avaliação for de uma publicação; ausente para catálogo)<br />
____- catalogo (catalogoId, quando a avaliação for de um catálogo; ausente para publicação)<br />
____- nota (inteiro de 1 a 5)<br />
____- comentario (string, até 1000 caracteres)<br />
____- data_criacao (timestamp)<br />
<br />
acesso/{usuarioId}/publicacoes/{publicacaoId}<br />
____- ativo (boolean, resumo calculado pelo servidor a partir das concessões)<br />
____- expira_em (timestamp ou null para acesso perpétuo)<br />
____- fontes/{fonteId} (concessão individual; somente backend pode ler/escrever)<br />
transacao/{transacaoId}<br />
____- comprador (usuarioId)<br />
____- vendedor (usuarioId)<br />
____- origem_tipo e origem_id (publicacao ou catalogo)<br />
____- publicacoes (ids cobertos pela aquisição)<br />
____- tipo (aluguel, compra ou assinatura)<br />
____- preco (centavos), moeda (BRL), status<br />
____- checkout_id (ID retornado pela Abacate Pay)<br />
____- taxa_plataforma (10% do valor, em centavos, calculada pelo backend)<br />
____- valor_criador (90% do valor, em centavos, calculado pelo backend)<br />
____- comprado_em <br />
____- expira_em (quando aplicável)<br />
dados_recebimento/{usuarioId} (dados privados de PIX e conta bancária, somente servidor)<br />
____- titular, cpf, banco, agencia, conta e tipo_conta<br />
____- pix_tipo e pix_chave<br />
____- pronto e atualizado_em<br />
saque/{saqueId} (histórico e comprovantes de saques simulados, somente servidor)<br />
____- vendedor, valor (centavos), moeda, status, email e criado_em<br />
____- destinatario (cópia dos dados informados no momento do saque)<br />
assinatura/{subscriptionId} (metadados internos, somente API autenticada)<br />
____- usuario<br />
____- vendedor <br />
____- catalogo<br />
____- publicacoes<br />
____- preco<br />
____- ciclo (mensal, trimestral, anual)<br />
____- status<br />
____- expira_em<br />
produto_gateway/{chave} e eventos_pagamento/{hashEvento}<br />
____- cache de produtos/ciclos e controle idempotente de webhooks (somente servidor)<br />

### Storage:

O fluxo de publicação envia os arquivos diretamente do navegador ao Firebase Storage. Os objetos ficam em:<br />
____publicacoes/arquivos/{usuarioId}/{publicacaoId}/{arquivo.ext}<br />
____publicacoes/miniaturas/{usuarioId}/{publicacaoId}/{miniatura.webp}<br />
____usuarios/{usuarioId}/{avatar.webp}<br />
    
No Firestore o campo publicacao arquivo e miniatura guardam o caminho dos objetos no Storage. <br />
As miniaturas podem ser enviadas pelo usuário (convertida para webp e comprimida),<br />
ou gerada automaticamente (primeiro frame/página/imagem).<br />

## Backend
### API do Next.js

O backend HTTP usa Route Handlers do App Router em 'app/api':<br />

- Login e cadastro continuam no SDK cliente Firebase. 'GET /api/auth' valida o ID token enviado como Bearer e retorna 'uid', e-mail e nome do usuário autenticado.<br />
- 'lib/firebase-auth-server.ts' centraliza validação do ID token e obtenção do 'uid'; cada endpoint protegido deve chamá-lo e usar o 'uid' retornado, nunca um ID enviado no corpo.<br />
- 'POST /api/content' reutiliza o autenticador e encaminha gravações ao Firestore REST com o token do usuário. As regras Firestore continuam autorizando cada gravação.<br />

Firebase Admin: as variáveis 'NEXT_PUBLIC_FIREBASE_*' do '.env' configuram o SDK web e não concedem privilégios administrativos. Login e publicação padrão usam o ID token do usuário e as regras do Firestore. Firebase Admin opera somente no servidor para que checkout e webhooks gravem concessões e transações confiáveis; por isso, ela exige também uma credencial de conta de serviço, guardada em variáveis secretas locais/Vercel.<br />

APIs protegidas usam 'authenticateFirebaseRequest', derivam o proprietário de 'user.uid' e não aceitam UID enviado no corpo como prova de identidade. As regras negam escrita do cliente em concessões, transações, assinaturas, cache de produtos e eventos de webhook. Dados de recebimento e saques também ficam inacessíveis diretamente pelo cliente; somente rotas autenticadas com Firebase Admin podem consultá-los ou gravá-los.<br />

- 'POST /api/payments/checkout' verifica a monetização e seu preço no Firestore, cria/reusa produto no gateway e retorna uma URL de Checkout.<br />
- 'POST /api/webhooks/abacatepay' valida o segredo compartilhado e a assinatura HMAC v2 antes de registrar pagamento e liberar acesso.<br />
- 'GET/PUT /api/payments/recipient' consulta e salva os dados privados de recebimento do usuário autenticado.<br />
- 'GET/POST /api/payments/withdrawals' calcula o saldo disponível e registra um saque simulado com comprovante no painel.<br />
- 'GET /api/payments/dashboard' devolve dados do próprio usuário; 'POST /api/payments/subscriptions/cancel' interrompe a recorrência sem antecipar o fim do acesso já pago.<br />

### Pagamentos

O comprador escolhe uma publicação ou catálogo e inicia o checkout da Abacate Pay. Compras e aluguéis avulsos usam PIX; assinaturas mensais de catálogo usam cartão. O servidor confirma o preço no Firestore e, após receber um webhook válido de pagamento, registra a transação e libera o acesso.<br />

Publicações e catálogos podem ser gratuitos ou pagos. Aluguéis dão acesso temporário, compras avulsas são permanentes e assinaturas de catálogo renovam mensalmente. Arquivos pagos continuam privados enquanto o usuário não tiver uma concessão válida. O painel de controle reúne compras, vendas, monetizações, assinaturas e saques; ao cancelar uma assinatura, o acesso continua até o fim do período pago.<br />

Para exibir anúncios AdSense antes do visualizador de publicações gratuitas, configure `NEXT_PUBLIC_ADSENSE_PUBLICATION_SLOT` com o ID do bloco de anúncio responsivo criado no AdSense. O anúncio não é renderizado enquanto essa variável não estiver definida. O código do cliente AdSense fica no layout raiz.

#### Recebimento dos criadores e saques de teste

A Abacate Pay usada neste projeto não faz split de marketplace. O pagamento continua sendo recebido pela conta da plataforma; após a confirmação do webhook, o backend registra contabilmente 10% como taxa da plataforma e 90% como parcela do criador, em centavos. Essa divisão inclui compras, aluguéis e cobranças/renovações de assinatura. Não há transferência real nem split enviado ao gateway.<br />

Antes de criar uma nova publicação, o criador precisa informar no painel nome, CPF, banco, agência, conta e chave PIX. O botão **Preencher dados fictícios** facilita testes locais e no sandbox. Esses dados ficam em 'dados_recebimento/{usuarioId}', não no perfil público 'usuario/{usuarioId}', e só são acessados pelas APIs autenticadas com Firebase Admin. Publicações existentes podem continuar sendo editadas.<br />

O saldo disponível soma a parcela de 90% das transações pagas e subtrai saques simulados anteriores. No painel, o criador informa um valor a partir de R$ 1,00; o servidor valida o saldo e registra atomicamente um documento 'saque/{saqueId}' com status 'simulado' e uma cópia do destinatário. O comprovante e o protocolo ficam disponíveis no painel. Nenhum dinheiro é transferido e não há provedor de e-mail configurado, portanto o comprovante não é enviado por e-mail.<br />

As gravações de pagamento, saldo e permissões usam Firebase Admin somente no servidor; suas credenciais administrativas não são expostas ao navegador.<br />

#### Fluxo da aquisição

    1: Na página da publicação, o component AcquisitionOptions.tsx envia uma requisição autenticada para 
    /api/payments/checkout.

    2: O endpoint valida o usuário, a publicação ou catálogo, a monetização e o preço. 
    Publicações antigas ou opções indisponíveis falham nessa etapa, antes de criar uma transação.

    3: lib/payment-products.ts procura ou provisiona o produto na Abacate Pay. 
    O registro produto_gateway é um cache reutilizável que permanece no Firestore 
    mesmo se a etapa seguinte falhar, mas não representa uma compra nem concede acesso.

    4: A Abacate Pay cria o checkout. Em api/payments/checkout/route.ts, 
    o documento transacao só é criado depois que a criação do checkout retorna sucesso; 
    ele já recebe o ID e a URL do checkout.

    5: O endpoint devolve a URL e o navegador redireciona o comprador. 
    Se a criação do checkout falhar, não é criado um documento transacao.

    6: Depois do pagamento, o webhook valida a assinatura, evita processar o mesmo evento duas vezes e localiza a transação. 
    Em pagamento confirmado, registra o acesso em acesso e marca a transação como pago; 
    aluguel expira conforme a duração. 
    Assinaturas passam pela confirmação e pelos eventos próprios de assinatura.

    7: O painel de controle lista compras, vendas, monetizações e assinaturas. O criador vê o total bruto, sua parcela de 90% e o saldo disponível; ao cancelar uma assinatura, o acesso continua até o fim do período já pago.

    8: Para testar um resgate, o criador informa um valor disponível e solicita o saque. O backend reserva o saldo em uma operação atômica e registra um comprovante simulado; não ocorre transferência real nem envio de e-mail.

    9: Botões de monetização refletem a aquisição:
    aluguel ativo impede outro aluguel, assinatura ativa impede assinar ou alugar, 
    e compra ativa mostra “Comprado”, desabilita as modalidades e permite download. 
    Publicações baixam o próprio arquivo; catálogos baixam os arquivos em um ZIP. 

### Avaliações

As avaliações de publicações e catálogos são armazenadas na coleção global 'avaliacao'. Cada usuário pode manter uma nota de 1 a 5 e um comentário por conteúdo. O usuário não grava nessa coleção nem altera a média diretamente: a API valida a identidade e os dados e usa Firebase Admin no servidor para salvar a avaliação e atualizar o campo 'avaliacao' do documento de publicação ou catálogo.<br />

#### Fluxo da avaliação

    1: O componente Reviews.tsx solicita 'GET /api/ratings/{targetType}/{targetId}' 
    para carregar a média, a quantidade de avaliações, as 20 avaliações mais recentes e, quando há sessão autenticada, a avaliação do próprio usuário.

    2: 'targetType' aceita 'publication' ou 'catalog'. A API consulta 'avaliacao' pelo campo 
    correspondente ('publicacao' ou 'catalogo') e lê a média armazenada no documento-alvo. 
    Se ainda não houver média persistida, calcula uma média de contingência a partir das notas válidas.

    3: Para publicar ou atualizar uma avaliação, o cliente envia 'POST' para o mesmo caminho, 
    com o ID token Firebase no cabeçalho Bearer e um corpo contendo 'rating' (inteiro de 1 a 5) e 
    'comment' (até 1000 caracteres). O servidor deriva 'usuario' do token, 
    não aceita um UID fornecido pelo cliente.

    4: O servidor cria uma transação Firestore, confirma que o conteúdo existe e 
    consulta as avaliações daquele conteúdo. 
    Soma as notas válidas, exclui a nota anterior do usuário que está avaliando novamente e inclui a nova nota. 
    A média é arredondada para uma casa decimal.

    5: Na mesma transação, a API grava ou atualiza 'avaliacao/{avaliacaoId}' e atualiza 
    'publicacao/{publicacaoId}.avaliacao' ou 'catalogo/{catalogoId}.avaliacao'. 
    Assim, alterar a própria avaliação substitui a nota e o comentário anteriores em vez de criar uma segunda avaliação.

    6: A interface atualiza a lista e exibe estrelas fracionadas com base na média. 
    Por exemplo, '4.5' é mostrado como quatro estrelas e meia. 
    Com zero avaliações, a média exibida é zero e nenhum valor médio precisa ser persistido.

Os documentos de publicação mantêm o formato de ID já usado antes da unificação da API, para que as avaliações existentes continuem associadas ao mesmo usuário e publicação. Para catálogos, o ID também inclui o tipo do alvo, evitando colisões com avaliações de publicação. Os campos 'publicacao' e 'catalogo' são mutuamente exclusivos em cada documento de avaliação.

### Pesquisa

A barra de pesquisa do componente 'Header.tsx' envia o termo como parâmetro 'q' para '/pesquisa'. A página 'app/pesquisa/page.tsx' lê esse parâmetro e o repassa ao componente 'app/pesquisa/SearchResults.tsx', que exibe as abas **Tudo**, **Publicações**, **Catálogos** e **Canais**. As abas filtram os resultados já carregados no navegador; **Carregar mais** busca a próxima página.

Utiliza índices de coleta do firestore.

#### Fluxo da pesquisa e paginação

    1: O hook reutilizável 'app/hooks/usePagedContent.ts' solicita 'GET /api/search', enviando o termo 'q', 
    o cursor da página e, na página de canal, o parâmetro 'channelId'. 
    O hook também controla carregamento, erros e a ação do botão **Carregar mais**.

    2: A rota 'app/api/search/route.ts' consulta as coleções Firestore 'publicacao' e 'catalogo'. 
    Quando há termo de pesquisa fora do contexto de um canal, também consulta 'usuario' para localizar canais. 
    Os textos são comparados sem diferenciar maiúsculas/minúsculas nem acentos.

    3: Cada coleção é consultada em páginas separadas, ordenadas pela data de criação (conteúdos) ou pelo nome (canais). 
    O limite é de 12 documentos por coleção em cada chamada; um 13.º documento é lido apenas para detectar se existe próxima página. Assim, uma resposta pode conter até 36 documentos antes da filtragem textual (12 publicações, 12 catálogos e 12 canais). 
    A busca por texto é aplicada aos documentos desse lote, não a toda a coleção de uma só vez.

    4: A rota inclui no cursor a última posição de cada coleção. Ao clicar **Carregar mais**, 
    o hook envia esse cursor e a rota continua a partir dos documentos seguintes. 
    O cursor só vale para o mesmo termo e canal. Pode haver páginas sem correspondências; 
    enquanto alguma coleção tiver mais documentos, a interface mantém o botão para continuar a pesquisa.

    5: A página inicial 'app/page.tsx' e a página de canal 'app/canal/ChannelPage.tsx' usam o mesmo hook e endpoint. 
    Na página de canal, a busca por título ou descrição é restrita pelo 'criador' correspondente ao 'channelId'; 
    os filtros de publicações e catálogos também operam sobre os resultados paginados. 
    O índice composto de 'firestore.indexes.json' atende essas consultas por criador e data e precisa estar publicado no Firebase.

    6: O endpoint usa 'getAdminFirestore()' de 'lib/firebase-admin.ts' no servidor. 
    O Web SDK ('lib/firebase.ts') continua usando as variáveis 'NEXT_PUBLIC_FIREBASE_*' para as operações do navegador, mas essas variáveis não inicializam o Admin SDK. 
    Localmente, o Admin pode usar uma conta de serviço por 'GOOGLE_APPLICATION_CREDENTIALS' apontando para o arquivo JSON, ou as variáveis 'FIREBASE_ADMIN_CLIENT_EMAIL' e 'FIREBASE_ADMIN_PRIVATE_KEY'.
