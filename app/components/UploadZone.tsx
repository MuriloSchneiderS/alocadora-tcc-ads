type UploadZoneProps = {
  label?: string;
  formats?: string;
  className?: string;
};

export default function UploadZone({ label = "Fazer upload de arquivo", formats = "Formatos aceitos: jpg, png, webp.", className = "" }: UploadZoneProps) {
  return (
    <label className={`flex cursor-pointer flex-col items-center justify-center border border-black/40 bg-panel-muted px-5 text-center text-sm text-white hover:bg-[#77756e] ${className}`}>
      <input type="file" className="sr-only" />
      <span className="mb-2 text-4xl font-light text-navy" aria-hidden="true">⇧</span>
      <span>{label}</span>
      <span className="mt-3 max-w-64 text-cream">{formats}</span>
    </label>
  );
}