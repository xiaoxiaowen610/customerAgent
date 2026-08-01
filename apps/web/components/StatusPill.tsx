const statusMap: Record<string, { label: string; tone: "neutral" | "warning" | "danger" | "" }> = {
  PENDING: { label: "待处理", tone: "warning" },
  PROCESSING: { label: "处理中", tone: "" },
  WAITING_USER: { label: "待用户补充", tone: "warning" },
  RESOLVED: { label: "已解决", tone: "" },
  CLOSED: { label: "已关闭", tone: "neutral" },
  ACTIVE: { label: "进行中", tone: "" },
  TRANSFERRED_TO_HUMAN: { label: "已转人工", tone: "warning" }
};

export function StatusPill({ value }: { value: string }) {
  const item = statusMap[value] ?? { label: value, tone: "neutral" as const };
  return <span className={`pill ${item.tone}`}>{item.label}</span>;
}
