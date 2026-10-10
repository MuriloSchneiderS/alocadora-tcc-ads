"use client";

export type MonetizationModel = {
  label: string;
  type: string;
  duration?: number;
  free?: boolean;
};
export type MonetizationDraft = {
  model: string;
  price: string;
};
type MonetizationEditorProps = {
  models: MonetizationModel[];
  value: MonetizationDraft[];
  onChange: (value: MonetizationDraft[]) => void;
  disabled?: boolean;
};

export function formatToCents(value: string, completeCents = false) {
  const clean = value.replace(/[^\d,]/g, "");
  if (!clean) return "";

  const separator = clean.indexOf(",");
  const reais = (separator < 0 ? clean : clean.slice(0, separator))
    .replace(/^0+(?=\d)/, "")//remove zero à esquerda, mantém for o único dígito
    .slice(0, 13);//limita para 13 digitos
  const cents = separator < 0 ? "" : clean.slice(separator + 1).replace(/,/g, "").slice(0, 2);
  const formattedReais = reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (separator < 0 && !completeCents) return formattedReais;
  return `${formattedReais || "0"},${completeCents ? cents.padEnd(2, "0") : cents}`;
}
export function toCents(value: string) {
  const [reais = "0", cents = ""] = value.replace(/\./g, "").split(",", 2);
  return Number(reais || "0") * 100 + Number(cents.padEnd(2, "0").slice(0, 2));
}

//Editor para gerenciar as opções de monetização, reutilizado em CatalogEditor e PublicacaoEditor
export default function MonetizationEditor({ models, value, onChange, disabled = false }: MonetizationEditorProps) {
  function update(index: number, field: "model" | "price", nextValue: string) {
    if (field === "model" && value.some((item, itemIndex) => itemIndex !== index && item.model === nextValue))
      return;
    onChange(value.map((item, itemIndex) => itemIndex === index
      ? { ...item, [field]: field === "price" ? formatToCents(nextValue) : nextValue }
      : item));
  }

  return (
    <div className="space-y-2">
      {value.map((item, index) => {
        const selectedModel = models.find((model) => model.label === item.model);
        return (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2" key={`${item.model}-${index}`}>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-center text-sm">
                <span className={index === 0 ? "" : "sr-only"}>Modelo de monetização:</span>
                <select className="mt-1 block h-8 w-full bg-panel-muted px-1 text-left text-xs" value={item.model} disabled={disabled} onChange={(event) => update(index, "model", event.target.value)}>
                  {models.map((model) => <option key={model.label} value={model.label} disabled={value.some((other, otherIndex) => otherIndex !== index && other.model === model.label)}>{model.label}</option>)}
                </select>
              </label>
              <label className="text-center text-sm">
                <span className={index === 0 ? "" : "sr-only"}>Preço (R$):</span>
                <span className="mt-1 flex h-8 items-center bg-panel-muted px-2 text-xs focus-within:outline-1 focus-within:outline-gold">
                  <span aria-hidden="true" className="mr-1 text-cream/70">R$</span>
                  <input className="min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed" type="text" inputMode="decimal" placeholder="0,00" aria-label={`Preço em reais para ${item.model}`} value={item.price} disabled={disabled || selectedModel?.free} onChange={(event) => update(index, "price", event.target.value)} onBlur={(event) => update(index, "price", formatToCents(event.target.value, true))} />
                </span>
              </label>
            </div>
            <button type="button" className="h-8 bg-panel-muted px-2 text-xs hover:bg-red hover:text-white disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Remover monetização ${item.model}`} disabled={disabled || value.length <= 1} title={value.length <= 1 ? "Mantenha ao menos uma opção de monetização" : undefined} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>
              Remover
            </button>
          </div>
        );
      })}
      <button type="button" className="w-full bg-panel-muted py-2 text-xs hover:bg-gold hover:text-navy disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled || value.length >= models.length} onClick={() => {
        const availableModel = models.find((model) => !value.some((item) => item.model === model.label));
        if (availableModel) onChange([...value, { model: availableModel.label, price: "" }]);
      }}>
        Adicionar monetização
      </button>
    </div>
  );
}