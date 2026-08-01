import Link from "next/link";
import { Bot, ClipboardList } from "lucide-react";

export default function HomePage() {
  return (
    <main className="main" id="main-content">
      <div className="login-shell">
        <section className="login-card section">
          <p className="eyebrow">FinServe AI</p>
          <h1>消费金融智能客服与工单协同平台</h1>
          <div className="entry-actions">
            <Link className="button primary" href="/login">
              <Bot size={18} />
              进入演示
            </Link>
            <Link className="button secondary" href="/admin/tickets">
              <ClipboardList size={18} />
              客服工作台
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
