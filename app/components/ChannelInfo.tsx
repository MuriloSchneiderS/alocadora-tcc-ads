type ChannelInfoProps = {
  name: string;
  title?: string;
  avatar: string;
  className?: string;
};

export default function ChannelInfo({ name, title, avatar, className = "" }: ChannelInfoProps) {
  return (
    <div className={`channel-info ${className}`}>
      <div className="channel-info-copy">
        <p className="channel-name">{name}</p>
        {title && <p className="channel-title">{title}</p>}
      </div>
      <img src={avatar} alt={`Avatar de ${name}`} className="channel-avatar" />
    </div>
  );
}