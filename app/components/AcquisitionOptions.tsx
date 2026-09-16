type AcquisitionOption = {
  label: string;
  price: string;
};

type AcquisitionOptionsProps = {
  options: AcquisitionOption[];
  compact?: boolean;
  direction?: "stacked" | "inline";
};

export default function AcquisitionOptions({ options, compact = false, direction = "stacked" }: AcquisitionOptionsProps) {
  return (
    <div className={`acquisition-options acquisition-options-${direction} ${compact ? "acquisition-options-compact" : ""}`}>
      {options.map(({ label, price }) => (
        <div className="acquisition-option" key={`${label}-${price}`}>
          <span className="acquisition-label">{label}</span>
          <button type="button" className="acquisition-price" aria-label={`${label}: ${price}`}>
            {price}
          </button>
        </div>
      ))}
    </div>
  );
}