"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "../providers";
//redireciona para o canal do usuário logado ou para a página de login caso não esteja logado.
export default function Canal() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    router.replace(user ? `/canal/${user.uid}` : "/login");
  }, [isLoading, router, user]);

  return <main className="flex min-h-screen items-center justify-center bg-ink text-sm text-cream">Abrindo seu canal...</main>;
}