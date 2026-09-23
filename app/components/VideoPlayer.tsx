"use client";

import { useEffect, useRef } from "react";
import videojs from "video.js";
import type Player from "video.js/dist/types/player";

type VideoPlayerProps = {
  src: string;
  type: string;
  title: string;
  fallback: React.ReactNode;
};

export default function VideoPlayer({ src, type, title, fallback }: VideoPlayerProps) {
  const videoElement = useRef<HTMLVideoElement | null>(null);
  const player = useRef<Player | null>(null);

  useEffect(() => {
    if (!videoElement.current) return;

    player.current = videojs(videoElement.current, {
      controls: true,
      fluid: true,
      playsinline: true,
      preload: "metadata",
      sources: [{ src, type }],
    });

    return () => {
      player.current?.dispose();
      player.current = null;
    };
  }, [src, type]);

  return (
    <div data-vjs-player className="h-full w-full bg-black">
      <video ref={videoElement} className="video-js vjs-big-play-centered h-full w-full" aria-label={title}>
        {fallback}
      </video>
    </div>
  );
}