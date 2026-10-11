"use client";

import { useEffect, useRef, useState } from "react";
import videojs from "video.js";

type VideoPlayerProps = {
  src: string;
  type: string;
  title: string;
  fallback: React.ReactNode;
};

export default function VideoPlayer({ src, type, title, fallback }: VideoPlayerProps) {
  const playerContainer = useRef<HTMLDivElement | null>(null);
  const [fallbackSource, setFallbackSource] = useState<string | null>(null);
  const sourceKey = `${type}\n${src}`;

  useEffect(() => {
    const container = playerContainer.current;
    if (!container) return;

    const videoElement = document.createElement("video-js");
    videoElement.classList.add("video-js", "vjs-big-play-centered", "h-full", "w-full");
    videoElement.setAttribute("aria-label", title);
    container.appendChild(videoElement);

    const player = videojs(videoElement, {
      controls: true,
      fluid: true,
      playsinline: true,
      preload: "metadata",
      sources: [{ src, type }],
    });
    const showFallback = () => setFallbackSource(sourceKey);
    const hideFallback = () => setFallbackSource((current) => current === sourceKey ? null : current);
    player.on("error", showFallback);
    player.on("loadstart", hideFallback);

    return () => {
      player.off("error", showFallback);
      player.off("loadstart", hideFallback);
      if (!player.isDisposed()) player.dispose();
    };
  }, [src, type, title, sourceKey]);

  return (
    <div data-vjs-player className="relative h-full w-full bg-black">
      <div ref={playerContainer} className="h-full w-full" />
      <div
        hidden={fallbackSource !== sourceKey}
        className="absolute inset-0 z-10 flex items-center justify-center bg-ink/90 p-4"
      >
        {fallback}
      </div>
    </div>
  );
}
