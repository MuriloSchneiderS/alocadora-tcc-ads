import "server-only";

const ABACATE_API_BASE = "https://api.abacatepay.com/v2";

type ApiResponse<T> = {
  success?: boolean;
  data?: T;
  error?: string | null;
};

export type AbacateProduct = {
  id: string;
};

export type AbacateCheckout = {
  id: string;
  url: string;
};

export class AbacatePayError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AbacatePayError";
  }
}

async function requestAbacatePay<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.ABACATEPAY_API_KEY;
  if (!apiKey)
    throw new Error("abacatepay-api-key-missing");

  let response: Response;
  let result: ApiResponse<T> | null;
  try {
    response = await fetch(`${ABACATE_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    result = await response.json().catch(() => null) as ApiResponse<T> | null;
  } catch {
    throw new AbacatePayError(503, "abacatepay-unavailable");
  }

  if (!response.ok || !result?.success || !result.data) {
    console.error("Abacate Pay request failed", { path, status: response.status });
    throw new AbacatePayError(response.status || 502, "abacatepay-request-failed");
  }
  return result.data;
}

export function createAbacateProduct(input: {
  externalId: string;
  name: string;
  description: string;
  price: number;
  cycle?: "MONTHLY";
}) {
  return requestAbacatePay<AbacateProduct>("/products/create", {
    ...input,
    currency: "BRL",
  });
}

export function createAbacateCheckout(input: {
  productId: string;
  externalId: string;
  returnUrl: string;
  completionUrl: string;
  metadata: Record<string, string>;
  subscription: boolean;
}) {
  return requestAbacatePay<AbacateCheckout>(
    input.subscription ? "/subscriptions/create" : "/checkouts/create",
    {
      items: [{ id: input.productId, quantity: 1 }],
      externalId: input.externalId,
      returnUrl: input.returnUrl,
      completionUrl: input.completionUrl,
      methods: input.subscription ? ["CARD"] : ["PIX", "CARD"],
      metadata: input.metadata,
    },
  );
}

export function cancelAbacateSubscription(subscriptionId: string) {
  return requestAbacatePay<{ id: string; status: string }>("/subscriptions/cancel", {
    id: subscriptionId,
  });
}
