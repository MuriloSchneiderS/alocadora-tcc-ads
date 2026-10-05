import ChannelInfo from "./ChannelInfo";
import AcquisitionOptions from "./AcquisitionOptions";

type MediaCardProps = {
  title: string;
  image: string;
  meta?: string;
  duration?: string;
  channel?: {
    channelId?: string;
    name: string;
    title?: string;
    avatar: string;
  };
  acquisitions?: {
    label: string;
    price: string;
  }[];
  variant?: "grid" | "row";
};

export default function MediaCard({ title, image, meta, duration, channel, acquisitions, variant = "grid" }: MediaCardProps) {
  if (variant === "row") {
    return (
      <article className="flex gap-3 border-b border-white/10 py-3 first:pt-0">
        <div className="relative h-20 w-32 shrink-0 overflow-hidden bg-panel-muted">
          <img src={image} alt="" className="h-full w-full object-cover" />
          {duration && <span className="absolute bottom-1 right-1 bg-ink/90 px-1 text-[10px]">{duration}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="media-card-title line-clamp-2 text-sm font-bold text-white">{title}</h3>
          {meta && <p className="mt-1 line-clamp-2 text-xs text-cream/70">{meta}</p>}
          {channel && <ChannelInfo {...channel} className="mt-2" />}
        </div>
        <button type="button" className="self-start px-2 text-xl leading-none text-cream/80 hover:text-gold" aria-label={`Opções para ${title}`}>
          ≡
        </button>
      </article>
    );
  }

  return (
    <article className="min-w-0">
      <div className="media-card-thumbnail group relative block aspect-video overflow-hidden bg-panel-muted">
        <a href="/exibicao" className="absolute inset-0" aria-label={`Abrir: ${title}`}>
          <img src={image} alt="" className="h-full w-full object-cover transition duration-200 group-hover:scale-105" />
        </a>
        {acquisitions && <div className="media-card-acquisition-overlay"><AcquisitionOptions options={acquisitions} compact /></div>}
        {duration && <span className="absolute bottom-1 right-1 bg-ink/90 px-1 text-[10px]">{duration}</span>}
      </div>
      <div className="media-card-info">
        <div className="min-w-0 flex-1">
          <h3 className="media-card-title line-clamp-2 text-xs font-medium text-white">{title}</h3>
          {meta && !channel && <p className="truncate text-[11px] text-cream/65">{meta}</p>}
        </div>
        <div className="media-card-actions">
          {channel && <ChannelInfo {...channel} />}
        </div>
      </div>
    </article>
  );
}