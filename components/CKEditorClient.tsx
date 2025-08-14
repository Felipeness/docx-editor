"use client";
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { api } from "@/lib/http";
import { DocumentMeta, ImportDocxResponse } from "@/lib/types";
import { exportDocxClient } from "@/lib/docx-export";

type EditorKit = {
  CKEditor: React.ComponentType<any>;
  ClassicEditor: any; // editor class do build
};

export const CKEditorClient: React.FC = () => {
  const [kit, setKit] = useState<EditorKit | null>(null);
  const [html, setHtml] = useState<string>("<p>Start writing…</p>");
  const [meta, setMeta] = useState<DocumentMeta>({
    title: "Untitled",
    author: "Anonymous",
  });
  const [zoom, setZoom] = useState<number>(1);
  const [wordCount, setWordCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [{ CKEditor }, Classic] = await Promise.all([
        import("@ckeditor/ckeditor5-react"),
        import("@ckeditor/ckeditor5-build-classic"),
      ]);
      if (mounted) setKit({ CKEditor, ClassicEditor: Classic.default });
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // ------- Plugin em CLASSE (estável) -------
  const smartListPlugin = useMemo(() => {
    return class SmartListPlugin {
      private editor: any;
      constructor(editor: any) {
        this.editor = editor;
      }
      init() {
        const editor = this.editor;

        const originalExecute = editor.execute.bind(editor);
        const makeListFromSelection = (
          type: "bulletedList" | "numberedList"
        ) => {
          const { model } = editor;
          const selection = model.document.selection;

          if (selection.isCollapsed) return originalExecute(type);

          model.change(() => {
            const selectedContent = model.getSelectedContent(selection);
            const viewFragment = editor.data.toView(selectedContent);
            const htmlSel = editor.data.processor.toData(viewFragment);

            const text = htmlSel
              .replace(/<\/(p|div|br)>/gi, "\n")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+\n/g, "\n")
              .replace(/\n\s+/g, "\n")
              .replace(/\s{2,}/g, " ")
              .trim();

            if (!text) return originalExecute(type);

            const lines = text
              .split(/\n+/)
              .map((l: string) => l.trim())
              .filter(Boolean);
            const html = lines
              .map((l: string) => `<p>${escapeHtml(l)}</p>`)
              .join("");
            const viewFrag = editor.data.processor.toView(html);
            const modelFrag = editor.data.toModel(viewFrag);
            model.insertContent(modelFrag, selection);
          });

          originalExecute(type);
        };

        (editor as any).execute = (name: string, ...args: any[]) => {
          if (
            (name === "bulletedList" || name === "numberedList") &&
            !editor.model.document.selection.isCollapsed
          ) {
            makeListFromSelection(name as "bulletedList" | "numberedList");
            return;
          }
          return originalExecute(name, ...args);
        };
      }
    };
  }, []);

  const config = useMemo<Record<string, unknown>>(
    () => ({
      licenseKey: "GPL",
      toolbar: {
        items: [
          "undo",
          "redo",
          "|",
          "heading",
          "|",
          "bold",
          "italic",
          "link",
          "|",
          "bulletedList",
          "numberedList",
          "|",
          "blockQuote",
        ],
        shouldNotGroupWhenFull: true,
      },
      extraPlugins: [smartListPlugin],
      placeholder: "Start writing…",
      fontFamily: {
        options: [
          "default",
          "Calibri,Segoe UI,Arial,sans-serif",
          "Georgia,serif",
          "Courier New,monospace",
        ],
        supportAllValues: true,
      },
      fontSize: {
        options: [11, 12, 14, "default", 18, 24, 32],
        supportAllValues: true,
      },
    }),
    [smartListPlugin]
  );

  const recomputeWordCount = useCallback((h: string) => {
    const text = h
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    setWordCount(text ? text.split(" ").length : 0);
  }, []);
  useEffect(() => {
    recomputeWordCount(html);
  }, [html, recomputeWordCount]);

  const onExport = useCallback(async () => {
    const blob = await exportDocxClient({ html, meta });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meta.title || "document"}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [html, meta]);

  const onImportDocx = useCallback(async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post<ImportDocxResponse>("/docx/import", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    setHtml((data.html as string) || "<p></p>");
  }, []);

  // Dimensões da folha
  const pageW = "21cm";
  const pageH = "29.7cm";
  const margin = "2cm"; // padding interno (margem visual)
  const innerMinH = `calc(${pageH} - (${margin} * 2))`; // altura útil

  // “Folha” (com zoom)
  const sheetStyle: React.CSSProperties = useMemo(
    () => ({
      width: pageW,
      minHeight: pageH,
      margin: "24px auto",
      background: "#fff",
      boxShadow: "0 12px 32px rgba(0,0,0,0.10)",
      transform: `scale(${zoom})`,
      transformOrigin: "top center",
      borderRadius: 8,
    }),
    [zoom]
  );

  const btnS: React.CSSProperties = {
    padding: "8px 12px",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fafafa",
  };
  const inpS: React.CSSProperties = {
    padding: "6px 8px",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    fontSize: 13,
    width: 180,
  };

  return (
    <div style={{ background: "#f3f4f6", minHeight: "100dvh" }}>
      {/* Topbar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "10px 16px",
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}>
          <strong style={{ fontSize: 14 }}>Editor</strong>
          <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />
          <input
            placeholder="Title"
            value={meta.title}
            onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
            style={inpS}
          />
          <input
            placeholder="Author"
            value={meta.author}
            onChange={(e) => setMeta((m) => ({ ...m, author: e.target.value }))}
            style={inpS}
          />
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={() => fileInputRef.current?.click()} style={btnS}>
              Import .docx
            </button>
            <button onClick={onExport} style={btnS}>
              Export .docx
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportDocx(f);
              }}
            />
          </div>
        </div>
      </div>

      {/* Ribbon secundária */}
      <div style={{ background: "#fff" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "8px 16px",
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#374151" }}>Zoom</span>
            <input
              type="range"
              min={0.75}
              max={2}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
            />
            <span style={{ fontSize: 12, width: 40, textAlign: "right" }}>
              {(zoom * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ padding: 24 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* Folha */}
          <div style={sheetStyle}>
            <div style={{ padding: margin }}>
              <div
                style={{
                  // container do editor: ocupa 100% da área útil
                  width: "100%",
                  minHeight: innerMinH,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: 0, 
                  overflow: "hidden",
                }}>
                {/* CSS global para o CK editor preencher a área útil */}
                <style jsx global>{`
                  /* Faz o wrapper e área editável ocuparem toda a largura do container */
                  .ck.ck-editor,
                  .ck.ck-editor__main {
                    width: 100%;
                  }
                  /* Altura mínima do conteúdo = altura útil da folha (sem as margens) */
                  .ck.ck-editor__main > .ck-editor__editable,
                  .ck.ck-editor__main > .ck-editor__editable_inline,
                  .ck.ck-content {
                    min-height: ${innerMinH};
                  }
                  /* Remove limites visuais estreitos e garante full width */
                  .ck.ck-content {
                    box-sizing: border-box;
                    width: 100%;
                    margin: 0;
                  }
                `}</style>

                {kit ? (
                  <kit.CKEditor
                    disableWatchdog
                    editor={kit.ClassicEditor}
                    data={html}
                    config={config}
                    onChange={(
                      _e: unknown,
                      editor: { getData: () => string }
                    ) => setHtml(editor.getData())}
                  />
                ) : (
                  <div style={{ color: "#9ca3af", fontSize: 13, padding: 12 }}>
                    Carregando editor…
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "#fff",
          borderTop: "1px solid #e5e7eb",
          padding: "6px 12px",
        }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
          }}>
          <div>
            Words: <strong>{wordCount}</strong>
          </div>
          <div>
            Zoom: <strong>{(zoom * 100).toFixed(0)}%</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ] as string)
  );
}
