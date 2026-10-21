"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers";

type AcquisitionOption = {
  label: string;// "Aluguel" | "Compra" | "Assinatura" | "Gratuito"
  price: string;
  tipo?: string;// aluguel | compra | assinatura | gratuito
};

type AcquisitionState = "purchased" | "rented" | "subscribed" | null;

type AcquisitionOptionsProps = {
  options: AcquisitionOption[];
  compact?: boolean;
  direction?: "stacked" | "inline";
  originType?: "publicacao" | "catalogo";
  originId?: string;
  ownerId?: string;
  acquisitionState?: AcquisitionState;
  isAcquisitionLoading?: boolean;
  onDownload?: () => void;
  isDownloading?: boolean;
};

export default function AcquisitionOptions({
  options,
  compact = false,
  direction = "stacked",
  originType,
  originId,
  ownerId,
  acquisitionState = null,
  isAcquisitionLoading = false,
  onDownload,
  isDownloading = false,
}: AcquisitionOptionsProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [loadingType, setLoadingType] = useState("");
  const [message, setMessage] = useState("");

  //inicia o processo de aquisição do conteúdo, redirecionando para a página de checkout
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
        if (result?.error === "already-acquired") {
          setMessage("Este conteúdo já foi adquirido ou está ativo na sua conta. Atualize a página para ver o estado atual.");
          return;
        }
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
        {options.map(({ label, price, tipo }) => {
          const isPurchase = tipo === "compra";
          const isRental = tipo === "aluguel";
          const isSubscription = tipo === "assinatura";
          const disabledByState = acquisitionState === "purchased"
            || (acquisitionState === "rented" && isRental)
            || (acquisitionState === "subscribed" && (isRental || isSubscription));
          const displayedLabel = acquisitionState === "purchased" && isPurchase
            ? "Comprado"
            : acquisitionState === "purchased"
              ? "Indisponível"
            : acquisitionState === "rented" && isRental
              ? "Alugado"
              : acquisitionState === "subscribed" && isSubscription
                ? "Assinado"
                : acquisitionState === "subscribed" && isRental
                  ? "Indisponível"
                : label;
          
          const canDownload = acquisitionState === "purchased" && isPurchase && onDownload;//se o conteúdo foi comprado o botão de download fica disponível
          //se o conteúdo foi alugado ou assinado, o botão de download não fica disponível, pois o acesso é temporário e depende da concessão de acesso ativa
          return <div className="acquisition-option" key={`${label}-${price}`}>
            <span className="acquisition-label">{displayedLabel}</span>
            {tipo && tipo !== "gratuito" && originType && originId
              ? <div className="acquisition-actions">
                <button
                  type="button"
                  className="acquisition-price"
                  aria-label={`${displayedLabel}: ${price}`}
                  disabled={Boolean(loadingType) || isAcquisitionLoading || ownerId === user?.uid || disabledByState}
                  onClick={() => void acquire(tipo)}
                >
                  {loadingType === tipo ? "Aguarde..." : price}
                </button>
                {canDownload && <button
                  type="button"
                  className="acquisition-download"
                  disabled={isDownloading || isAcquisitionLoading}
                  onClick={onDownload}
                >
                  {isDownloading ? "Preparando..." : "Baixar"}
                </button>}
              </div>
              : <span className="acquisition-price inline-block text-center" aria-label={`${displayedLabel}: ${price}`}>{price}</span>}
          </div>;
        })}
        {acquisitionState === "purchased" && onDownload && !options.some((option) => option.tipo === "compra")
          && <button
            type="button"
            className="acquisition-download"
            disabled={isDownloading || isAcquisitionLoading}
            onClick={onDownload}
          >
            {isDownloading ? "Preparando..." : "Baixar"}
          </button>}
      </div>
      {message && <p className="mt-2 text-xs text-red" role="alert">{message}</p>}
    </div>
  );
}