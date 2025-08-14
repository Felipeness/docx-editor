# DOCX Editor Frontend — Next.js + CKEditor

<p align="center">
  <a href="https://nextjs.org/"><img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black?logo=next.js"></a>
  <a href="https://ckeditor.com/"><img alt="CKEditor" src="https://img.shields.io/badge/CKEditor-5-3C99DC"></a>
  <a href="https://typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white"></a>
</p>

> Modern DOCX editing frontend built with **Next.js 14**, **React 18**, and **CKEditor 5**, fully integrated with the [editor-backend](https://github.com/Felipeness/editor-backend) for seamless DOCX ⇄ HTML conversion.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quickstart](#quickstart)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [API Integration](#api-integration)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

- **Import DOCX**: Upload `.docx` files to the backend and convert them into clean, editable HTML.
- **Export DOCX**: Save edited HTML content back into `.docx` format.
- **Rich Text Editing**: Powered by CKEditor 5 with custom plugins and toolbar.
- **Metadata Handling**: Title and author management for each document.
- **Fast & Responsive**: Built with Next.js 15 and TypeScript for performance and reliability.

---

## Tech Stack

- **Next.js 15** — App Router, Server Components
- **CKEditor 5** — Rich text editing
- **TypeScript**
- **Fetch API** — Integration with backend

---

## Quickstart

### 1) Clone the repository

```bash
git clone https://github.com/Felipeness/docx-editor.git
cd docx-editor
```

### 2) Install dependencies

```bash
pnpm install
# or
yarn install
```

### 3) Configure environment variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

### 4) Run the development server

```bash
npm run dev
# or
yarn dev
```

Visit: [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

| Variable              | Description          | Default                 |
| --------------------- | -------------------- | ----------------------- |
| `NEXT_PUBLIC_API_URL` | Backend API base URL | `http://127.0.0.1:8000` |

---

## Project Structure

```
docx-editor/
├─ public/                 # Static assets
├─ src/
│  ├─ components/          # CKEditor integration & UI components
│  ├─ lib/                 # HTTP client, utils
│  ├─ pages/               # Next.js pages
│  └─ styles/              # Global styles
├─ package.json
├─ README.md
└─ banner.png
```

---

## API Integration

The frontend communicates with the backend API documented here:
[editor-backend API](https://github.com/Felipeness/editor-backend#api)

**Example: Import DOCX**

```ts
const fd = new FormData();
fd.append("file", file);
const res = await fetch(\`\${process.env.NEXT_PUBLIC_API_URL}/docx/import\`, {
  method: "POST",
  body: fd,
});
if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
const { html, metadata } = await res.json();
```

**Example: Export DOCX**

```ts
const res = await fetch(\`\${process.env.NEXT_PUBLIC_API_URL}/docx/export\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ html, meta: { title, author } }),
});
const blob = await res.blob();
saveAs(blob, \`\${title || "document"}.docx\`);
```

---

## Development

```bash
pnpm run dev        # Start dev server
pnpm run build      # Build for production
pnpm run start      # Run production server
```

---

## Troubleshooting

- **CORS issues**: Ensure your backend allows requests from the frontend domain.
- **Import errors (400)**: Ensure you're sending `multipart/form-data` with the correct field name.
- **Backend not running**: Start the backend before using the frontend.

---

## License

MIT License — free to use and modify.
