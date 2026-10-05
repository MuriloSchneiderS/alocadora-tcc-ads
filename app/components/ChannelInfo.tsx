import Link from "next/link";
import { getChannelPath } from "../../lib/mock-channels";

type ChannelInfoProps = {
  channelId?: string;
  name: string;
  title?: string;
  avatar: string;
  className?: string;
};

export default function ChannelInfo({ channelId, name, title, avatar, className = "" }: ChannelInfoProps) {
  return (
    <Link href={getChannelPath(channelId ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""))} className={`channel-info ${className}`} aria-label={`Abrir canal de ${name}`}>
      <div className="channel-info-copy">
        <p className="channel-name">{name}</p>
        {title && <p className="channel-title">{title}</p>}
      </div>
      <img src={avatar} alt={`Avatar de ${name}`} className="channel-avatar" />
    </Link>
  );
}