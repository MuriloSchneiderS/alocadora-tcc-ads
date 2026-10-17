export type SearchMediaItem = {
  id: string;
  type: "publication" | "catalog";
  createdAt: number;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  href: string;
  monetizations: string[];
  acquisitions: { label: string; price: string }[];
  channel: {
    channelId: string;
    name: string;
    title: string;
    avatar: string;
  };
};

export type SearchChannelItem = {
  id: string;
  type: "channel";
  name: string;
  title: string;
  description: string;
  avatar: string;
  href: string;
};

export type SearchItem = SearchMediaItem | SearchChannelItem;

export type SearchPage = {
  items: SearchItem[];
  nextCursor: string | null;
};
