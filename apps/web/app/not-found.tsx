import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="main" id="main-content">
      <div className="login-shell">
        <section className="login-card section">
          <p className="eyebrow">404</p>
          <h1>页面不存在</h1>
          <p className="muted-copy">当前路径没有对应的演示页面。</p>
          <Link className="button primary" href="/chat">
            <ArrowLeft size={18} />
            返回客服会话
          </Link>
        </section>
      </div>
    </main>
  );
}
