"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../providers";

type Review = {
  id: string;
  author: string;
  rating: number;
  comment: string;
  createdAt: string;
};

type ReviewSummary = {
  average: number;
  count: number;
  reviews: Review[];
  userReview: { rating: number; comment: string } | null;
};

type ScopedValue<T> = { scope: string; value: T };

function StarDisplay({ value, label }: { value: number; label: string }) {
  return <span className="inline-flex items-center gap-0.5" role="img" aria-label={label}>
    {Array.from({ length: 5 }, (_, index) => {
      const fill = Math.max(0, Math.min(100, (value - index) * 100));
      return <span className="relative inline-block text-xl leading-none" key={index} aria-hidden="true">
        <span className="text-white/25">★</span>
        <span className="absolute inset-y-0 left-0 overflow-hidden text-gold" style={{ width: `${fill}%` }}>★</span>
      </span>;
    })}
  </span>;
}

export default function Reviews({
  targetType,
  targetId,
  initialAverage = 0,
}: {
  targetType: "publication" | "catalog";
  targetId: string;
  initialAverage?: number;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const scope = `${targetType}:${targetId}:${user?.uid ?? ""}`;
  const [summaryState, setSummaryState] = useState<ScopedValue<ReviewSummary> | null>(null);
  const [formState, setFormState] = useState<ScopedValue<{ rating: number; comment: string }> | null>(null);
  const [hoverRating, setHoverRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const [messageState, setMessageState] = useState<ScopedValue<string> | null>(null);
  const summary = summaryState?.scope === scope ? summaryState.value : {
    average: initialAverage,
    count: 0,
    reviews: [],
    userReview: null,
  };
  const hasLoadedSummary = summaryState?.scope === scope;
  const form = formState?.scope === scope ? formState.value : {
    rating: summary.userReview?.rating ?? 0,
    comment: summary.userReview?.comment ?? "",
  };
  const message = messageState?.scope === scope ? messageState.value : "";
  const endpoint = `/api/ratings/${targetType}/${encodeURIComponent(targetId)}`;

  async function loadReviews() {
    const headers = user ? { Authorization: `Bearer ${await user.getIdToken()}` } : undefined;
    const response = await fetch(endpoint, { headers, cache: "no-store" });
    const result = await response.json().catch(() => null) as ReviewSummary | null;
    if (!response.ok || !result) throw new Error("Não foi possível carregar as avaliações.");
    setSummaryState({ scope, value: result });
  }

  useEffect(() => {
    let isCurrent = true;
    async function load() {
      try {
        const headers = user ? { Authorization: `Bearer ${await user.getIdToken()}` } : undefined;
        const response = await fetch(endpoint, { headers, cache: "no-store" });
        const result = await response.json().catch(() => null) as ReviewSummary | null;
        if (!response.ok || !result) throw new Error("Não foi possível carregar as avaliações.");
        if (isCurrent) setSummaryState({ scope, value: result });
      } catch (error) {
        if (isCurrent) setMessageState({
          scope,
          value: error instanceof Error ? error.message : "Não foi possível carregar as avaliações.",
        });
      }
    }

    void load();
    return () => { isCurrent = false; };
  }, [endpoint, scope, user]);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      router.push("/login");
      return;
    }
    if (saving) return;
    if (!form.rating) {
      setMessageState({ scope, value: "Escolha uma nota de 1 a 5 estrelas." });
      return;
    }
    if (!form.comment.trim()) {
      setMessageState({ scope, value: "Escreva um comentário para publicar sua avaliação." });
      return;
    }

    setSaving(true);
    setMessageState({ scope, value: "" });
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ rating: form.rating, comment: form.comment }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        if (result?.error === "rating-target-not-found") throw new Error("Este conteúdo não está mais disponível.");
        throw new Error("Não foi possível publicar a avaliação.");
      }
      await loadReviews();
      setMessageState({ scope, value: "Avaliação publicada." });
    } catch (error) {
      setMessageState({ scope, value: error instanceof Error ? error.message : "Não foi possível publicar a avaliação." });
    } finally {
      setSaving(false);
    }
  }

  return <section className="min-w-0" aria-labelledby={`reviews-title-${targetType}-${targetId}`}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 id={`reviews-title-${targetType}-${targetId}`} className="text-sm font-semibold text-white">Avaliações</h2>
      <div className="flex items-center gap-2" aria-label={`Média ${summary.average.toFixed(1)} de 5, ${summary.count} avaliações`}>
        <StarDisplay value={summary.average} label={`Média de ${summary.average.toFixed(1)} de 5 estrelas`} />
        <span className="text-sm text-cream/80">{summary.average > 0 ? summary.average.toFixed(1) : "—"}</span>
        <span className="text-xs text-cream/60">({summary.count})</span>
      </div>
    </div>

    <div className="border-b border-white/10 bg-panel p-3">
      <form onSubmit={(event) => void submitReview(event)}>
        <label className="mb-2 block text-l text-cream/80" htmlFor={`review-comment-${targetType}-${targetId}`}>
          <div className="flex items-center justify-between gap-2">
          {summary.userReview ? "Atualize sua avaliação" : "Escreva sua avaliação"}
            <div className="flex text-xl" onMouseLeave={() => setHoverRating(0)}>
              {Array.from({ length: 5 }, (_, index) => {
                const rating = index + 1;
                const active = hoverRating || form.rating;
                return <button
                  key={rating}
                  type="button"
                  aria-label={`Selecionar ${rating} ${rating === 1 ? "estrela" : "estrelas"}`}
                  aria-pressed={form.rating === rating}
                  disabled={saving}
                  onMouseEnter={() => setHoverRating(rating)}
                  onFocus={() => setHoverRating(rating)}
                  onBlur={() => setHoverRating(0)}
                  onClick={() => setFormState({ scope, value: { ...form, rating } })}
                  className={`px-0.5 text-xl leading-none disabled:cursor-wait disabled:opacity-60 ${rating <= active ? "text-gold" : "text-white/35"}`}
                >★</button>;
              })}
            </div>
          </div>
        </label>
        <textarea
          id={`review-comment-${targetType}-${targetId}`}
          value={form.comment}
          maxLength={1000}
          rows={3}
          placeholder="O que você achou?"
          onChange={(event) => setFormState({ scope, value: { ...form, comment: event.target.value } })}
          className="w-full resize-y border border-white/15 bg-ink px-3 py-2 text-sm text-white placeholder:text-cream/45 focus:border-gold focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-white disabled:cursor-wait disabled:opacity-60"
          >{saving ? "Publicando..." : summary.userReview ? "Atualizar avaliação" : "Publicar avaliação"}</button>
        </div>
      </form>
      {message && <p className="mt-2 text-xs text-cream/75" role="status">{message}</p>}
    </div>

    <div className="divide-y divide-white/10">
      {summary.reviews.map((review) => <article key={review.id} className="bg-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-white">{review.author}</span>
          <div className="flex items-center gap-2">
            <StarDisplay value={review.rating} label={`${review.rating} de 5 estrelas`} />
            {review.createdAt && <time className="text-xs text-cream/55" dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString("pt-BR")}</time>}
          </div>
        </div>
        {review.comment && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-cream/80">{review.comment}</p>}
      </article>)}
      {hasLoadedSummary && summary.count === 0 && <p className="bg-panel p-3 text-xs text-cream/65">Ainda não há avaliações.</p>}
      {hasLoadedSummary && summary.count > summary.reviews.length && <p className="bg-panel px-3 py-2 text-xs text-cream/60">Exibindo as {summary.reviews.length} avaliações mais recentes.</p>}
      {!hasLoadedSummary && !message && <p className="bg-panel p-3 text-xs text-cream/65">Carregando avaliações...</p>}
    </div>
  </section>;
}