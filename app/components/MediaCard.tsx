"use client";

import { useRef, useState } from "react";
import ChannelInfo from "./ChannelInfo";
import AcquisitionOptions from "./AcquisitionOptions";

type MediaCardProps = {
  title: string;
  image: string;
  meta?: string;
  duration?: string;
  href?: string;
  monetizations?: string[];
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
  manageMenu?: boolean;
  onRemove?: () => void;
  reorderId?: string;
  isReordering?: boolean;
  onReorderStart?: () => void;
  onReorderMove?: (clientX: number, clientY: number) => void;
  onReorderEnd?: () => void;
};

export default function MediaCard({ title, image, meta, duration, href, monetizations, channel, acquisitions, variant = "grid", manageMenu = false, onRemove, reorderId, isReordering = false, onReorderStart, onReorderMove, onReorderEnd }: MediaCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdPosition = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const suppressClick = useRef(false);

  function cancelHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdPosition.current = null;
  }

  function startHold(event: React.PointerEvent<HTMLButtonElement>) {
    if (!reorderId || !onReorderStart) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    holdPosition.current = { x: event.clientX, y: event.clientY };
    holdTimer.current = setTimeout(() => {
      isDragging.current = true;
      suppressClick.current = true;
      setMenuOpen(false);
      onReorderStart();
    }, 400);
  }

  function moveHold(event: React.PointerEvent<HTMLButtonElement>) {
    if (isDragging.current) {
      onReorderMove?.(event.clientX, event.clientY);
      return;
    }
    if (holdPosition.current && Math.hypot(event.clientX - holdPosition.current.x, event.clientY - holdPosition.current.y) > 10)
      cancelHold();
  }

  function endHold() {
    cancelHold();
    if (isDragging.current) {
      isDragging.current = false;
      onReorderEnd?.();
      window.setTimeout(() => { suppressClick.current = false; }, 0);
    }
  }

  if (variant === "row") {
    return (
      <article data-publication-id={reorderId} className={`flex gap-3 border-b border-white/10 py-3 first:pt-0 ${isReordering ? "bg-white/5 opacity-60" : ""}`}>
        <div className="relative h-20 w-32 shrink-0 overflow-hidden bg-panel-muted">
          <img src={image} alt="" className="h-full w-full object-cover" />
          {duration && <span className="absolute bottom-1 right-1 bg-ink/90 px-1 text-[10px]">{duration}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="media-card-title line-clamp-2 text-sm font-bold text-white">{title}</h3>
          {meta && <p className="mt-1 line-clamp-2 text-xs text-cream/70">{meta}</p>}
          {channel && <ChannelInfo {...channel} className="mt-2" />}
        </div>
        {manageMenu && onRemove && <div className="relative self-start">
          <button type="button" className={`touch-none px-2 text-xl leading-none text-cream/80 hover:text-gold ${reorderId ? "cursor-grab active:cursor-grabbing" : ""}`} aria-label={reorderId ? `Opções e reordenação para ${title}; segure para mover` : `Opções para ${title}`} aria-haspopup="menu" aria-expanded={menuOpen} onPointerDown={startHold} onPointerMove={moveHold} onPointerUp={endHold} onPointerCancel={endHold} onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            setMenuOpen((open) => !open);
          }}>
            ≡
          </button>
          {menuOpen && <div className="absolute right-0 top-full z-20 min-w-44 border border-white/15 bg-panel p-1 shadow-lg" role="menu">
            <button type="button" role="menuitem" disabled className="block w-full px-3 py-2 text-left text-xs text-cream/45" title="Edição de publicação ainda não disponível">
              Editar publicação
            </button>
            <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-xs text-cream hover:bg-red hover:text-white" onClick={() => { setMenuOpen(false); onRemove(); }}>
              Remover publicação do catálogo
            </button>
          </div>}
        </div>}
      </article>
    );
  }

  return (
    <article className="min-w-0">
      <div className="media-card-thumbnail group relative block aspect-video overflow-hidden bg-panel-muted">
        <a href={href ?? "/exibicao"} className="absolute inset-0" aria-label={`Abrir: ${title}`}>
          <img src={image} alt="" className="h-full w-full object-cover transition duration-200 group-hover:scale-105" />
        </a>
        {monetizations && monetizations.length > 0 && <div className="media-card-monetizations">
          {monetizations.map((label) => <span key={label}>{label}</span>)}
        </div>}
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