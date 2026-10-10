"use client";

import { signOut, updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { ChangeEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Header from "../components/Header";
import { auth, db, storage } from "../../lib/firebase";
import { createDefaultUserProfile, DEFAULT_USER_AVATAR } from "../../lib/user-profile";
import { useAuth } from "../providers";

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
  const { user, isLoading } = useAuth();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_USER_AVATAR);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(DEFAULT_USER_AVATAR);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  useEffect(() => {
    if (!isLoading && !user)
      router.replace("/login");
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!user) return;

    const authenticatedUser = user;
    let isCurrent = true;
    async function loadProfile() {
      setIsProfileLoading(true);
      try {
        const snapshot = await getDoc(doc(db, "usuario", authenticatedUser.uid));
        const fallback = createDefaultUserProfile(authenticatedUser.displayName || authenticatedUser.email?.split("@")[0] || "Meu canal");
        const profile = snapshot.exists() ? { ...fallback, ...snapshot.data() } : fallback;
        if (isCurrent) {
          setName(profile.nome);
          setTitle(profile.titulo);
          setDescription(profile.descricao);
          setAvatarUrl(profile.avatar);
          setAvatarPreview(profile.avatar);
        }
      } catch {
        if (isCurrent) {
          const fallback = createDefaultUserProfile(authenticatedUser.displayName || authenticatedUser.email?.split("@")[0] || "Meu canal");
          setName(fallback.nome);
          setTitle(fallback.titulo);
          setDescription(fallback.descricao);
          setAvatarUrl(fallback.avatar);
          setAvatarPreview(fallback.avatar);
          setProfileMessage("Não foi possível carregar os dados do canal.");
        }
      } finally {
        if (isCurrent)
          setIsProfileLoading(false);
      }
    }

    void loadProfile();
    return () => { isCurrent = false; };
  }, [user]);

  useEffect(() => {
    return () => {
      if (avatarPreview.startsWith("blob:"))
        URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/");
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setProfileMessage("A imagem deve ter no máximo 5 MB.");
      event.target.value = "";
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setProfileMessage("");
  }

  async function handleSaveProfile() {
    if (!user) return;
    setIsSaving(true);
    setProfileMessage("");

    try {
      let nextAvatarUrl = avatarUrl;
      if (avatarFile) {
        const image = await createImageBitmap(avatarFile);
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 512 / Math.max(image.width, image.height));
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível processar a imagem.");
        context.drawImage(image, 0, 0);
        image.close();
        const webp = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível converter a imagem.")), "image/webp", 0.9);
        });
        if (webp.type !== "image/webp")
          throw new Error("Seu navegador não conseguiu converter a imagem para WebP.");
        if (webp.size > 5 * 1024 * 1024)
          throw new Error("A imagem convertida deve ter no máximo 5 MB.");

        const avatarRef = ref(storage, `usuarios/${user.uid}/avatar.webp`);
        await uploadBytes(avatarRef, webp, { contentType: "image/webp" });
        nextAvatarUrl = await getDownloadURL(avatarRef);
      }

      await setDoc(doc(db, "usuario", user.uid), {
        nome: name.trim(),
        titulo: title.trim(),
        descricao: description.trim(),
        avatar: nextAvatarUrl,
      }, { merge: true });
      await updateProfile(user, { displayName: name.trim(), photoURL: nextAvatarUrl });
      setAvatarUrl(nextAvatarUrl);
      setAvatarPreview(nextAvatarUrl);
      setAvatarFile(null);
      setProfileMessage("Alterações salvas.");
    } catch (saveError) {
      setProfileMessage(saveError instanceof Error ? saveError.message : "Não foi possível salvar as alterações.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || !user)
    return <main className="flex min-h-screen items-center justify-center bg-ink text-sm text-cream">Carregando painel...</main>;

  return <div className="min-h-screen bg-ink text-cream">
    <Header title="Painel do canal" showSearch={false} />
    <main className="mx-auto max-w-3xl bg-panel px-5 py-4 sm:px-6">
      <section className="grid gap-5 md:grid-cols-[145px_1fr]">
        <div>
          <p className="mb-1 text-sm">Ícone do canal:</p>
          <label className="group relative flex h-36 w-36 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-black/40 bg-panel-muted">
            <img src={avatarPreview} alt="Avatar do canal" className="h-full w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-ink/80 py-2 text-center text-xs text-white group-hover:bg-ink">Alterar imagem</span>
            <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} />
          </label>
          <p className="mt-1 max-w-36 text-center text-xs text-cream/70">JPG, PNG ou WebP, até 5 MB</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase" htmlFor="channel-name">Nome</label>
          <input id="channel-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="w-full border border-white/20 bg-ink px-3 py-2 text-lg text-white" required />
          <label className="mb-1 mt-3 block text-xs font-bold uppercase" htmlFor="channel-title">Título do canal</label>
          <input id="channel-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="w-full border border-white/20 bg-ink px-3 py-2 text-sm text-white" />
          <label className="mb-1 mt-3 block text-xs font-bold uppercase" htmlFor="channel-description">Descrição</label>
          <textarea id="channel-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} className="h-24 w-full resize-y bg-panel-muted p-2 text-sm text-white placeholder:text-cream/70" placeholder="Descrição do canal" />
          <div className="mt-2 flex items-center justify-end gap-3">
            {profileMessage && <p role="status" className="mr-auto text-xs text-cream/80">{profileMessage}</p>}
            <button type="button" disabled={isSaving || isProfileLoading || !name.trim()} onClick={handleSaveProfile} className="bg-ink px-8 py-2 text-xs font-bold hover:bg-gold hover:text-navy disabled:cursor-wait disabled:opacity-60">{isSaving ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}</button>
          </div>
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
