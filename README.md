# Alocadora-TCC-ADS
Plataforma de publicação de conteúdo (vídeos, arte, livros, arquivos diversos…), onde o conteúdo publicado pode ser alugável, comprável ou gratuito com anúncios. Pode ir desde uma biblioteca à um serviço de streaming pessoal a depender de como o criador quiser disponibilizar seu conteúdo.

Protótipo de estrutura:
    Frontend: Next.js (React, TailwindCSS, TypeScript, Vite, React Query, Zustand);
    Backend: Next.js API Routes &| Firebase Cloud Functions (Webhooks, triggers);
    Autenticação: Firebase Auth; (Google, Email/Senha...);
    Banco de Dados: Firestore (Banco de Dados, url do storage), Cloud Storage(Armazenamento de arquivos);
    Pagamentos: Stripe; (Pagamentos, assinaturas, checkout...)
    Deploy: Vercel (Frontend, Backend, Cloud Functions);

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

As Functions usam Node.js 22 e declaram `@google-cloud/firestore` diretamente para que o pacote esteja presente no ambiente implantado. Se a criação dos gatilhos do Storage retornar `storage.buckets.get denied`, habilite a Compute Engine API e conceda leitura de metadados do bucket ao service agent do Eventarc antes de repetir o deploy:

```powershell
$PROJECT_NUMBER = gcloud projects describe alocadora-60233 --format="value(projectNumber)"
gcloud services enable compute.googleapis.com eventarc.googleapis.com --project alocadora-60233
gcloud storage buckets add-iam-policy-binding gs://alocadora-60233.firebasestorage.app --member="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-eventarc.iam.gserviceaccount.com" --role="roles/storage.legacyBucketReader"
firebase deploy --only functions --project alocadora-60233
```

O comando IAM requer `gcloud` e uma conta com permissão para editar a política IAM do bucket. Aguarde alguns minutos após habilitar APIs ou criar a identidade de serviço do Eventarc antes de tentar novamente.