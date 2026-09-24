"use client";

import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { auth } from "../../lib/firebase";

function getAuthErrorMessage(error: unknown) {
    if (!(error instanceof FirebaseError))
        return "Não foi possível concluir a operação. Tente novamente.";

    const messages: Record<string, string> = {
        "auth/email-already-in-use": "Este e-mail já está cadastrado.",
        "auth/invalid-credential": "E-mail ou senha incorretos.",
        "auth/invalid-email": "Informe um e-mail válido.",
        "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
        "auth/network-request-failed": "Não foi possível conectar ao Firebase.",
    };

    return messages[error.code] ?? "Não foi possível concluir a operação. Tente novamente.";
}

export default function LoginPage() {
    const router = useRouter();
    const [isRegistering, setIsRegistering] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setIsSubmitting(true);

        try {
            if (isRegistering) {
                const credential = await createUserWithEmailAndPassword(auth, email, password);
                if (name.trim())
                    await updateProfile(credential.user, { displayName: name.trim() });
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
            router.push("/painel_controle");
        } catch (submitError) {
            setError(getAuthErrorMessage(submitError));
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-ink px-4 py-10 text-cream">
            <section className="w-full max-w-md border border-white/10 bg-panel p-6 shadow-2xl sm:p-8">
                <Link href="/" className="mb-8 block text-center">
                    <img src="/assets/logo-dark.png" alt="Alocadora" className="mx-auto h-auto w-52" />
                </Link>
                <div className="mb-6">
                    <p className="site-accent text-xs font-bold uppercase tracking-[0.2em]">Sua conta</p>
                    <h1 className="mt-1 text-3xl font-bold text-white">{isRegistering ? "Criar cadastro" : "Entrar"}</h1>
                    <p className="mt-2 text-sm text-cream/70">
                        {isRegistering ? "Crie seu perfil para publicar, alugar, assinar..." : "Acesse seu painel e continue de onde parou."}
                    </p>
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                    {isRegistering &&
                        <div>
                            <label className="mb-1 block text-xs font-bold uppercase" htmlFor="name">Nome</label>
                            <input id="name" value={name} onChange={(event) => setName(event.target.value)} className="w-full border border-white/20 bg-ink px-3 py-3 text-sm text-white" autoComplete="name" />
                        </div>
                    }
                    <div>
                        <label className="mb-1 block text-xs font-bold uppercase" htmlFor="email">E-mail</label>
                        <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full border border-white/20 bg-ink px-3 py-3 text-sm text-white" autoComplete="email" required />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-bold uppercase" htmlFor="password">Senha</label>
                        <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full border border-white/20 bg-ink px-3 py-3 text-sm text-white" autoComplete={isRegistering ? "new-password" : "current-password"} minLength={6} required />
                    </div>
                    {error && <p role="alert" className="border border-red/60 bg-red/10 px-3 py-2 text-sm text-red">{error}</p>}
                    <button type="submit" disabled={isSubmitting} className="w-full bg-orange px-4 py-3 text-sm font-bold text-navy hover:bg-cream disabled:cursor-wait disabled:opacity-60">{isSubmitting ? "AGUARDE..." : isRegistering ? "CRIAR CONTA" : "ENTRAR"}</button>
                </form>

                <button type="button" className="mt-5 w-full text-sm text-cream/75 underline decoration-orange underline-offset-4 hover:text-white" onClick={() => { setIsRegistering((current) => !current); setError(""); }}>
                    {isRegistering ? "Já tenho uma conta" : "Ainda não tenho uma conta"}
                </button>
                <Link href="/" className="mt-6 block text-center text-xs text-cream/60 hover:text-white">Voltar para a página inicial</Link>
            </section>
        </main>
    );
}
