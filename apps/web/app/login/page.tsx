"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, LogIn, Mail } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { writeSession, UserSession } from "../../lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("user@finserve.dev");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("请输入有效邮箱");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 位");
      return;
    }

    setLoading(true);
    try {
      const session = await apiFetch<UserSession>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      writeSession(session);
      router.replace(session.user.role === "USER" ? "/chat" : "/admin/tickets");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="main" id="main-content">
      <div className="login-shell">
        <form className="login-card section" onSubmit={submit}>
          <p className="eyebrow">FinServe AI</p>
          <h1>登录演示环境</h1>
          <div className="demo-accounts">
            <button className="demo-account" type="button" onClick={() => setEmail("user@finserve.dev")}>
              用户账号
              <span>user@finserve.dev</span>
            </button>
            <button className="demo-account" type="button" onClick={() => setEmail("agent@finserve.dev")}>
              客服账号
              <span>agent@finserve.dev</span>
            </button>
          </div>
          <label className="field">
            <span className="label">邮箱</span>
            <span className="input-with-icon">
              <Mail size={17} />
              <input className="input bare" value={email} onChange={(event) => setEmail(event.target.value)} />
            </span>
          </label>
          <label className="field">
            <span className="label">密码</span>
            <span className="input-with-icon">
              <LockKeyhole size={17} />
              <input
                className="input bare"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </span>
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button className="button primary full" type="submit" disabled={loading}>
            <LogIn size={18} />
            {loading ? "登录中" : "登录"}
          </button>
        </form>
      </div>
    </main>
  );
}
