import "../style.css";
import "../excel-table.css";
import "../record-tools.css";

export const metadata = {
  title: "LabNote · 实验记录助手",
  description: "LabNote 实验记录助手，用于管理实验流程、记录和统计数据。"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
