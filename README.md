# LabNote

LabNote 已重构为 Next.js 项目，并通过兼容层继续使用原有页面结构、样式和浏览器本地存储功能。

## 本地运行

```bash
npm install
npm run dev
```

然后访问 `http://localhost:3000`。

## Supabase 环境变量

复制环境变量模板：

```bash
cp .env.example .env.local
```

在 `.env.local` 中填写：

```env
NEXT_PUBLIC_SUPABASE_URL=你的项目地址
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的匿名公钥
```

不要填写或提交 `service_role` 密钥。

## 构建

```bash
npm run build
```

项目采用静态导出，构建结果位于 `out/`。仓库中的 GitHub Actions 工作流会在 `xin` 分支更新后自动构建并部署到 GitHub Pages。
