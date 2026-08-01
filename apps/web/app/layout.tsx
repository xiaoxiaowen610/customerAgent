import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinServe AI",
  description: "消费金融智能客服与工单协同平台"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
