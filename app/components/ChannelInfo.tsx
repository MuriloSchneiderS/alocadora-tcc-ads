import Link from "next/link";

type ChannelInfoProps = {
  channelId?: string;
  name: string;
  title?: string;
  avatar: string;
  className?: string;
};

export default function ChannelInfo({ channelId, name, title, avatar, className = "" }: ChannelInfoProps) {
  const content = (
    <>
      <div className="channel-info-copy">
        <p className="channel-name">{name}</p>
        {title && <p className="channel-title">{title}</p>}
      </div>
      <img src={avatar} alt={`Avatar de ${name}`} className="channel-avatar" />
    </>
  );

  return channelId
    ? <Link href={`/canal/${encodeURIComponent(channelId)}`} className={`channel-info ${className}`} aria-label={`Abrir canal de ${name}`}>{content}</Link>
    : <div className={`channel-info ${className}`}>{content}</div>;
}