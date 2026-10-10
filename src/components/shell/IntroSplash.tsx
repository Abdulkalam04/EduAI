import { useCallback, useEffect, useRef, useState } from "react";

const INTRO_SEEN_KEY = "eduai_intro_seen";

export function IntroSplash() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dismissedRef = useRef(false);

  const markSeen = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  const dismiss = useCallback(
    (immediate = false) => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      markSeen();

      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch {
          // ignore
        }
      }

      if (immediate) {
        setVisible(false);
      } else {
        setFading(true);
        setTimeout(() => {
          setVisible(false);
        }, 300);
      }
    },
    [markSeen],
  );

  useEffect(() => {
    try {
      if (sessionStorage.getItem(INTRO_SEEN_KEY)) {
        dismissedRef.current = true;
        setVisible(false);
        return;
      }
    } catch {
      // ignore
    }

    const video = videoRef.current;
    let started = false;

    // Safety: Hard maximum of 6 seconds total
    const maxTimer = setTimeout(() => {
      dismiss(false);
    }, 6000);

    // Safety: Dismiss if playback has not started within 3 seconds
    const startTimer = setTimeout(() => {
      if (!started) {
        dismiss(false);
      }
    }, 3000);

    const onPlayingOrPlay = () => {
      started = true;
    };

    const onEnded = () => {
      dismiss(false);
    };

    const onError = () => {
      dismiss(true);
    };

    if (video) {
      video.addEventListener("play", onPlayingOrPlay);
      video.addEventListener("playing", onPlayingOrPlay);
      video.addEventListener("ended", onEnded);
      video.addEventListener("error", onError);

      // Sound: First try playing with sound.
      // If rejected (e.g. autoplay policy blocked), fallback to muted play.
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          if (dismissedRef.current) return;
          video.muted = true;
          video.play().catch(() => {
            dismiss(true);
          });
        });
      }
    }

    return () => {
      clearTimeout(maxTimer);
      clearTimeout(startTimer);
      if (video) {
        video.removeEventListener("play", onPlayingOrPlay);
        video.removeEventListener("playing", onPlayingOrPlay);
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("error", onError);
      }
    };
  }, [dismiss]);

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="App introduction"
      data-testid="intro-splash"
      onClick={() => dismiss(true)}
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#0D0B17] transition-opacity duration-300 ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          src="/intro.mp4"
          playsInline
          preload="auto"
          className="max-h-full w-full object-contain pointer-events-none"
          style={{
            WebkitMaskImage: "radial-gradient(circle, black 60%, transparent 100%)",
            maskImage: "radial-gradient(circle, black 60%, transparent 100%)",
          }}
        />
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          dismiss(true);
        }}
        className="absolute bottom-6 right-6 z-10 rounded-full border border-white/10 bg-black/40 px-3.5 py-1 text-xs font-medium text-white/80 shadow-sm backdrop-blur-md transition hover:bg-black/60 hover:text-white active:scale-95"
        style={{
          bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
          right: "calc(1.5rem + env(safe-area-inset-right, 0px))",
        }}
      >
        Skip
      </button>
    </div>
  );
}
