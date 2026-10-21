"use client";

import { useEffect, useRef, useState } from "react";

type ArchiveClientProps = {
  mode?: "cloud" | "guest";
};

export default function ArchiveClient({ mode = "cloud" }: ArchiveClientProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function mountArchive() {
      try {
        const response = await fetch("/shell.html", { cache: "no-store" });
        if (!response.ok) throw new Error("页面骨架加载失败");
        const source = await response.text();
        const documentCopy = new DOMParser().parseFromString(source, "text/html");
        if (!hostRef.current) return;
        hostRef.current.innerHTML = documentCopy.body.innerHTML;
        document.documentElement.dataset.hiMeMode = mode;

        const script = document.createElement("script");
        script.src = `/app.js?mode=${mode}`;
        script.async = false;
        script.dataset.hiMeClient = "true";
        document.body.appendChild(script);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "页面加载失败");
      }
    }

    void mountArchive();
  }, [mode]);

  return (
    <div ref={hostRef}>
      <p className="site-loading" role="status">
        {error || "正在打开私人档案…"}
      </p>
    </div>
  );
}
