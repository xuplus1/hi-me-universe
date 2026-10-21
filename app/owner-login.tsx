"use client";

import { FormEvent, useState } from "react";

export default function OwnerLogin() {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const key = String(form.get("archiveKey") ?? "");
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!response.ok) throw new Error("档案钥匙不正确，请再试一次。");
      window.location.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法打开档案");
      setSubmitting(false);
    }
  }

  return (
    <main className="signin-page">
      <section className="signin-paper" aria-labelledby="signin-title">
        <p className="signin-kicker">HI！ME · PERSONAL ARCHIVE</p>
        <h1 id="signin-title">打开我的档案</h1>
        <p className="signin-copy">
          输入只属于你的档案钥匙。它不会写入 GitHub，验证成功后才能读取作品、点亮日期与便签。
        </p>
        <form className="signin-form" onSubmit={unlock}>
          <label htmlFor="archiveKey">私人档案钥匙</label>
          <input
            id="archiveKey"
            name="archiveKey"
            type="password"
            minLength={10}
            autoComplete="current-password"
            required
          />
          <button className="signin-button" type="submit" disabled={submitting}>
            {submitting ? "正在打开…" : "打开 Hi！Me"}
          </button>
        </form>
        {error ? <p className="signin-error" role="alert">{error}</p> : null}
        <a className="signin-secondary" href="/try">在这台设备体验空宇宙</a>
        <p className="signin-note">验证信息使用安全 Cookie 保存，30 天后需要重新输入。</p>
      </section>
      <div className="signin-universe" aria-hidden="true">
        <span className="signin-orbit signin-orbit-one" />
        <span className="signin-orbit signin-orbit-two" />
        <span className="signin-planet" />
        <p>HI！ME</p>
      </div>
    </main>
  );
}
