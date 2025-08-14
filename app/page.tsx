"use client";
import React, { useState } from "react";
import { DocxEditor } from "@/components/DocxEditor";
import { CKEditorClient } from "@/components/CKEditorClient";

export default function Page() {
  const [mode, setMode] = useState<"docx" | "ckeditor">("docx");
  const tabs = ["Home", "Insert", "Layout"]; // apenas visual

  return (
    <div style={{ minHeight: "100dvh", background: "#f3f3f3" }}>
      {/* Topbar */}
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
          <strong>Editor</strong>
          <div style={{ width: 1, height: 20, background: "#e5e7eb" }} />
          <button
            onClick={() => setMode("docx")}
            style={{
              padding: "6px 10px",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              background: mode === "docx" ? "#f3f4f6" : "#fff",
            }}>
            Docx Editor
          </button>
          <button
            onClick={() => setMode("ckeditor")}
            style={{
              padding: "6px 10px",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              background: mode === "ckeditor" ? "#f3f4f6" : "#fff",
            }}>
            CKEditor
          </button>

          {/* Tabs (visuais) */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {tabs.map((t) => (
              <div
                key={t}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  fontSize: 13,
                  color: "#374151",
                }}>
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Área central */}
      <div style={{ padding: 24 }}>
        {mode === "docx" ? <DocxEditor /> : <CKEditorClient />}
      </div>
    </div>
  );
}
