"use client";

import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Header from "../components/Header";
import UploadZone from "../components/UploadZone";
import { auth } from "../../lib/firebase";

//Mock para demonstração
const publicationStats = [["Gratuitos", "25"], ["À venda", "1"], ["Alugáveis", "1"], ["Playlists / Catálogos", "1"]];
const audienceStats = [["Anúncios", "50 mil"], ["Vendas", "10"], ["Alugando", "10"], ["Assinantes", "20"]];
const walletStats = [["Anúncios", "R$ 200,00"], ["Vendas", "R$ 100,00"], ["Aluguéis", "R$ 100,00"], ["Assinaturas", "R$ 100,00"]];

function StatRow({ title, items, total }: { title: string; items: string[][]; total: string }) {
  return <section className="mt-2">
    <h2 className="text-xl text-white">{title}</h2>
    <div className="grid grid-cols-2 gap-2 bg-panel-muted p-1 sm:grid-cols-5">
      <div className="p-1 text-sm text-white">
        {total}
      </div>
      {items.map(([label, value]) =>
        <div key={label} className="bg-[#817e75] p-1 text-center text-xs">
          <p className="min-h-8 text-cream">{label}</p>
          <span className="text-white">{value}
          </span>
        </div>
      )}
    </div>
  </section>;
}

export default function PainelControle() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser);
    setIsCheckingAuth(false);
    if (!currentUser)
      router.replace("/login");
  }), [router]);

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/");
  }

  if (isCheckingAuth || !user)
    return <main className="flex min-h-screen items-center justify-center bg-ink text-sm text-cream">Carregando painel...</main>;

  return <div className="min-h-screen bg-ink text-cream">
    <Header title="Painel do canal" showSearch={false} />
    <main className="mx-auto max-w-3xl bg-panel px-5 py-4 sm:px-6">
      <section className="grid gap-5 md:grid-cols-[145px_1fr]">
        <div>
          <p className="mb-1 text-sm">Ícone do canal:</p>
          <UploadZone className="h-36 rounded-full" formats="Formatos aceitos: jpg, png, webp." accept={{ "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] }} />
        </div>
        <div>
          <h1 className="text-3xl text-white">{user.displayName || user.email}</h1>
          <p className="text-lg">Seu canal</p>
          <textarea className="mt-2 h-16 w-full resize-none bg-panel-muted p-2 text-xs placeholder:text-cream/70" placeholder="Descrição..." />
          <button type="button" className="float-right mt-2 bg-ink px-8 py-2 text-xs hover:bg-gold hover:text-navy">SALVAR ALTERAÇÕES</button>
        </div>
      </section>
      <div className="clear-both pt-14">
        <StatRow title="Publicações" total="Total: 25" items={publicationStats} />
        <StatRow title="Estatísticas" total="Visualizações" items={audienceStats} />
        <StatRow title="Carteira" total="Total resgatável: R$ 500,00" items={walletStats} />
      </div>
      <button type="button" onClick={handleSignOut} className="mt-8 border border-red px-5 py-2 text-xs font-bold text-red hover:bg-red hover:text-white">FAZER LOGOFF</button>
    </main>
  </div>;
}
