"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers";

type AcquisitionOption = {
  label: string;
  price: string;
  tipo?: string;
};

type AcquisitionOptionsProps = {
  options: AcquisitionOption[];
  compact?: boolean;
  direction?: "stacked" | "inline";
  originType?: "publicacao" | "catalogo";
  originId?: string;
  ownerId?: string;
};

export default function AcquisitionOptions({
  options,
  compact = false,
  direction = "stacked",
  originType,
  originId,
  ownerId,
}: AcquisitionOptionsProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [loadingType, setLoadingType] = useState("");
  const [message, setMessage] = useState("");

  async function acquire(type: string) {
    if (!originType || !originId || !["aluguel", "compra", "assinatura"].includes(type) || loadingType)
      return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (ownerId === user.uid) {
      setMessage("Você já tem acesso ao seu próprio conteúdo.");
      return;
    }

    setLoadingType(type);
    setMessage("");
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ originType, originId, tipo: type }),
      });
      const result = await response.json().catch(() => null) as { checkoutUrl?: string; error?: string } | null;
      if (!response.ok || !result?.checkoutUrl) {
        if (result?.error === "firebase-admin-configuration")
          throw new Error("O Firebase Admin ainda não está configurado no servidor.");
        if (result?.error === "monetization-unavailable")
          throw new Error("Esta opção de acesso não está mais disponível.");
        if (result?.error === "payment-product-provisioning")
          throw new Error("A configuração do pagamento está sendo preparada. Tente novamente em instantes.");
        if (result?.error === "abacatepay-configuration")
          throw new Error("Configure a chave de API da Abacate Pay no servidor.");
        if (result?.error === "app-url-configuration")
          throw new Error("Configure a URL HTTPS do site no servidor.");
        if (result?.error === "cannot-purchase-own-content")
          throw new Error("Você já tem acesso ao seu próprio conteúdo.");
        throw new Error("Não foi possível iniciar o pagamento. Tente novamente.");
      }
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível iniciar o pagamento.");
    } finally {
      setLoadingType("");
    }
  }

  return (
    <div>
      <div className={`acquisition-options acquisition-options-${direction} ${compact ? "acquisition-options-compact" : ""}`}>
      {options.map(({ label, price, tipo }) => (
        <div className="acquisition-option" key={`${label}-${price}`}>
          <span className="acquisition-label">{label}</span>
          {tipo && tipo !== "gratuito" && originType && originId
            ? <button
              type="button"
              className="acquisition-price disabled:cursor-wait disabled:opacity-60"
              aria-label={`${label}: ${price}`}
              disabled={Boolean(loadingType) || ownerId === user?.uid}
              onClick={() => void acquire(tipo)}
            >
              {loadingType === tipo ? "Aguarde..." : price}
            </button>
            : <span className="acquisition-price inline-block text-center" aria-label={`${label}: ${price}`}>{price}</span>}
        </div>
      ))}
      </div>
      {message && <p className="mt-2 text-xs text-red" role="alert">{message}</p>}
    </div>
  );
}