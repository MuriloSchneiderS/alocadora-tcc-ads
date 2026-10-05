import ChannelPage from "../ChannelPage";

export default async function CanalPorId({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  return <ChannelPage channelId={channelId} />;
}