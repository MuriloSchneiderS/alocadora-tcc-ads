"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../providers";

export type AcquisitionState = "purchased" | "rented" | "subscribed" | null;

//hook personalizado para gerenciar o estado de aquisição do usuário para uma publicação ou catálogo específico
export function useAcquisitionState(originType: "publicacao" | "catalogo", originId: string) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [state, setState] = useState<AcquisitionState>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {//inicia o efeito para carregar o estado de aquisição sempre que o usuário, o tipo de origem ou o ID da origem mudarem
    let isCurrent = true;

    async function loadState() {
      if (isAuthLoading) return;
      if (!user) {
        setState(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const readState = async () => {
        try {
          const response = await fetch(
            `/api/payments/access?originType=${originType}&originId=${encodeURIComponent(originId)}`,
            { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" },
          );
          if (!response.ok) return null;
          const result = await response.json() as { state?: AcquisitionState };
          return result.state ?? null;
        } catch {
          return null;
        }
      };

      let nextState = await readState();
      if (!isCurrent) return;
      setState(nextState);
      const isPaymentCompletion = new URLSearchParams(window.location.search).get("pagamento") === "confirmacao";
      if (isPaymentCompletion && !nextState) {
        for (let attempt = 0; attempt < 15 && isCurrent && !nextState; attempt++) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          if (!isCurrent) return;
          nextState = await readState();
          if (nextState) setState(nextState);
        }
        if (isCurrent) {
          const url = new URL(window.location.href);
          url.searchParams.delete("pagamento");
          window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        }
      }
      if (isCurrent) setIsLoading(false);
    }

    void loadState();
    return () => { isCurrent = false; };
  }, [originId, originType, user, isAuthLoading]);

  return { acquisitionState: state, isAcquisitionLoading: isLoading };
}