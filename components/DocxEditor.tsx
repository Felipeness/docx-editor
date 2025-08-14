"use client";
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { api } from "@/lib/http";
import {
  DocumentMeta,
  DocumentMetaSchema,
  ImportDocxResponse,
} from "@/lib/types";
import { exportDocxClient } from "@/lib/docx-export";

type BlockTag = "P" | "H1" | "H2" | "H3";

function getSelectionLi(): HTMLLIElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node: Node | null = sel.anchorNode;
  while (node) {
    if (node instanceof HTMLLIElement) return node;
    node = node.parentNode as Node | null;
  }
  return null;
}

function ensureLiTextWrapper(li: HTMLLIElement) {
  const existing = li.querySelector(
    ":scope > .li-text"
  ) as HTMLSpanElement | null;
  if (existing) return existing;
  const span = li.ownerDocument!.createElement("span");
  span.className = "li-text";
  while (li.firstChild) span.appendChild(li.firstChild);
  li.appendChild(span);
  return span;
}

/** -------- WordCount helpers -------- */
function normalizeEditorText(el: HTMLElement): string {
  // innerText respeita visibilidade e quebra como o usuário vê.
  let text = el.innerText || "";
  // remove NBSP (U+00A0) e zero-width (U+200B…U+200D)
  text = text.replace(/\u00A0/g, " ").replace(/[\u200B-\u200D\uFEFF]/g, "");
  // normaliza whitespace (inclui quebras)
  text = text.replace(/[ \t\r\n\f\v]+/g, " ").trim();
  return text;
}

function countWords(text: string): number {
  if (!text) return 0;
  // Melhor contagem: Segmenter (linguagem-agnóstico)
  // @ts-ignore - browsers modernos têm; fallback logo abaixo
  if (typeof Intl !== "undefined" && (Intl as any).Segmenter) {
    // @ts-ignore
    const seg = new Intl.Segmenter(undefined, { granularity: "word" });
    let count = 0;
    // @ts-ignore
    for (const s of seg.segment(text)) if (s.isWordLike) count++;
    return count;
  }
  // Fallback unicode-friendly (conta letras/dígitos e alfas com apóstrofo/hífen)
  const m = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

export const DocxEditor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [meta, setMeta] = useState<DocumentMeta>({
    title: "Untitled",
    author: "Anonymous",
  });
  const [zoom, setZoom] = useState<number>(1);
  const [wordCount, setWordCount] = useState<number>(0);
  const [isFocused, setFocused] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  // rAF + observer refs (evita recomputes excessivos)
  const rafId = useRef<number | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  const ensureNotEmpty = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML.replace(/\s|&nbsp;|<br\/?>/gi, "") === "") {
      el.innerHTML = "<p><br/></p>";
    }
  }, []);

  const recomputeWordCount = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const text = normalizeEditorText(el);
    setWordCount(countWords(text));

    const empty =
      el.innerHTML
        .replace(/<br\/?>|&nbsp;|\s+/gi, "")
        .replace(/<p><\/p>/gi, "") === "" || text.length === 0;
    setIsEmpty(empty);
  }, []);

  const scheduleRecompute = useCallback(() => {
    if (rafId.current != null) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      recomputeWordCount();
    });
  }, [recomputeWordCount]);

  const setInitialContentOnce = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.childNodes.length === 0 || el.innerHTML.trim() === "") {
      el.innerHTML = "<p><br/></p>";
    }
    recomputeWordCount();
  }, [recomputeWordCount]);

  // whitelist + preserva data-heading em LI e class="li-text" em SPAN
  const sanitizeHtml = useCallback((html: string) => {
    const allowed = new Set([
      "P",
      "H1",
      "H2",
      "H3",
      "UL",
      "OL",
      "LI",
      "B",
      "STRONG",
      "I",
      "EM",
      "A",
      "BR",
      "SPAN",
    ]);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const walk = (node: Node): Node | null => {
      if (node.nodeType === Node.TEXT_NODE) return node;
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const el = node as HTMLElement;
      const tag = el.tagName.toUpperCase();

      if (!allowed.has(tag)) {
        const frag = doc.createDocumentFragment();
        Array.from(el.childNodes).forEach((c) => {
          const kept = walk(c);
          if (kept) frag.appendChild(kept);
        });
        return frag;
      }

      if (tag === "A") {
        const href = el.getAttribute("href") || "";
        el.getAttributeNames().forEach((n) => el.removeAttribute(n));
        if (href && /^https?:\/\//i.test(href)) {
          el.setAttribute("href", href);
          el.setAttribute("rel", "noopener noreferrer");
          el.setAttribute("target", "_blank");
        } else {
          const span = doc.createElement("span");
          span.textContent = el.textContent || "";
          return span;
        }
      } else if (tag === "LI") {
        const dh = el.getAttribute("data-heading");
        el.getAttributeNames().forEach((n) => {
          if (n !== "data-heading") el.removeAttribute(n);
        });
        if (dh && !/^[123]$/.test(dh)) el.removeAttribute("data-heading");
      } else if (tag === "SPAN") {
        const cls = el.getAttribute("class");
        el.getAttributeNames().forEach((n) => el.removeAttribute(n));
        if (cls === "li-text") el.setAttribute("class", "li-text");
      } else {
        el.getAttributeNames().forEach((n) => el.removeAttribute(n));
      }

      Array.from(el.childNodes).forEach((c) => {
        const kept = walk(c);
        if (kept !== c) {
          if (kept) el.replaceChild(kept, c);
          else el.removeChild(c);
        }
      });

      return el;
    };

    const outFrag = doc.createDocumentFragment();
    Array.from(doc.body.childNodes).forEach((n) => {
      const kept = walk(n);
      if (kept) outFrag.appendChild(kept);
    });

    if (!outFrag.firstChild) {
      const p = doc.createElement("p");
      p.innerHTML = "<br/>";
      outFrag.appendChild(p);
    }
    const container = doc.createElement("div");
    container.appendChild(outFrag);
    return container.innerHTML;
  }, []);

  const focusEditor = () => editorRef.current?.focus();

  // ---------- heading inteligente (dentro/fora de LI) ----------
  const formatBlockSmart = useCallback(
    (tag: BlockTag) => {
      const li = getSelectionLi();
      if (!li) {
        const tryFmt = (val: string) =>
          document.execCommand("formatBlock", false, val);
        if (!tryFmt(tag)) tryFmt(tag.toLowerCase());
        if (!tryFmt(tag)) tryFmt(`<${tag.toLowerCase()}>`);
        focusEditor();
        scheduleRecompute();
        return;
      }
      const level =
        tag === "H1" ? "1" : tag === "H2" ? "2" : tag === "H3" ? "3" : "";
      if (!level) return;
      const current = li.getAttribute("data-heading");
      if (current === level) li.removeAttribute("data-heading");
      else li.setAttribute("data-heading", level);
      ensureLiTextWrapper(li);
      focusEditor();
      scheduleRecompute();
    },
    [scheduleRecompute]
  );

  // ---------- comandos inline ----------
  const exec = useCallback(
    (cmd: string, value?: string) => {
      document.execCommand(cmd, false, value);
      focusEditor();
      scheduleRecompute();
    },
    [scheduleRecompute]
  );

  const getHtml = useCallback(
    () => editorRef.current?.innerHTML ?? "<p></p>",
    []
  );

  // ---------- export/import ----------
  const onExport = useCallback(async () => {
    const blob = await exportDocxClient({ html: getHtml(), meta });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meta.title || "document"}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getHtml, meta]);

  const onImportDocx = useCallback(
    async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post<ImportDocxResponse>("/docx/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const html = sanitizeHtml((data.html || "<p></p>").trim());
      const el = editorRef.current;
      if (el) {
        el.innerHTML = html;
        ensureNotEmpty();
        recomputeWordCount();
      }
      if (data.metadata) {
        const parsed = DocumentMetaSchema.partial().safeParse(data.metadata);
        if (parsed.success) setMeta((m) => ({ ...m, ...parsed.data }));
      }
    },
    [ensureNotEmpty, sanitizeHtml, recomputeWordCount]
  );

  // ---------- effects ----------
  useEffect(() => {
    setInitialContentOnce();
  }, [setInitialContentOnce]);

  // Observa QUALQUER mudança no DOM (inclusive undo/redo, execCommand, paste rico)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const obs = new MutationObserver(() => scheduleRecompute());
    obs.observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    observerRef.current = obs;
    return () => {
      obs.disconnect();
      observerRef.current = null;
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, [scheduleRecompute]);

  // ---------- eventos ----------
  const onInput = () => {
    // ainda chamamos para suportar browsers que não disparam mutações em certas ações
    scheduleRecompute();
  };

  const onPaste: React.ClipboardEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    scheduleRecompute();
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      document.execCommand("insertText", false, "    ");
      scheduleRecompute();
    }
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) =>
    e.preventDefault();

  // ---------- dimensões “folha” ----------
  const pageW = "21cm";
  const pageH = "29.7cm";
  const margin = "2cm";
  const innerMinH = `calc(${pageH} - (${margin} * 2))`;

  // ---------- estilos ----------
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
    padding: "6px 10px",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    background: "#f9fafb",
  };
  const inpS: React.CSSProperties = {
    padding: "6px 8px",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    fontSize: 13,
    width: 160,
  };

  const toolbar = useMemo(
    () => [
      { label: "H1", onClick: () => formatBlockSmart("H1") },
      { label: "H2", onClick: () => formatBlockSmart("H2") },
      { label: "H3", onClick: () => formatBlockSmart("H3") },
      { label: "B", onClick: () => exec("bold") },
      { label: "I", onClick: () => exec("italic") },
      { label: "UL", onClick: () => exec("insertUnorderedList") },
      { label: "OL", onClick: () => exec("insertOrderedList") },
      { label: "↶", onClick: () => exec("undo") },
      { label: "↷", onClick: () => exec("redo") },
    ],
    [exec, formatBlockSmart]
  );

  return (
    <div style={{ background: "#f3f4f6", minHeight: "100dvh" }}>
      {/* Ribbon */}
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto 8px",
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 8,
        }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}>
          <button style={btnS} onClick={() => fileInputRef.current?.click()}>
            Import .docx
          </button>
          <button style={btnS} onClick={onExport}>
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
          <div
            style={{
              width: 1,
              height: 20,
              background: "#e5e7eb",
              margin: "0 6px",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
          <div
            style={{
              width: 1,
              height: 20,
              background: "#e5e7eb",
              margin: "0 6px",
            }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {toolbar.map((b) => (
              <button key={b.label} style={btnS} onClick={b.onClick}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Canvas + folha */}
      <div
        style={{
          background: "#f3f3f3",
          paddingBottom: 32,
          minHeight: "calc(100dvh - 180px)",
        }}>
        <div style={sheetStyle}>
          <div style={{ padding: margin }}>
            <div
              ref={editorRef}
              contentEditable
              spellCheck
              role="textbox"
              aria-multiline="true"
              onInput={onInput}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onDrop={onDrop}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                ensureNotEmpty();
                scheduleRecompute();
              }}
              style={{
                width: "100%",
                minHeight: innerMinH,
                position: "relative",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 12,
                outline: "none",
                lineHeight: 1.6,
                fontSize: 16,
                fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                caretColor: "#111827",
                background: "#fff",
                userSelect: "text",
              }}
            />

            {/* Placeholder visual */}
            {isEmpty && !isFocused && (
              <div style={{ position: "relative", pointerEvents: "none" }}>
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    color: "#9ca3af",
                    fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
                    fontSize: 16,
                  }}>
                  Start writing…
                </div>
              </div>
            )}

            {/* Estilos para heading em LI */}
            <style>{`
              .li-text { display: inline; }
              li[data-heading="1"] > .li-text { font-size: 2em; font-weight: 700; line-height: 1.2; }
              li[data-heading="2"] > .li-text { font-size: 1.5em; font-weight: 700; line-height: 1.25; }
              li[data-heading="3"] > .li-text { font-size: 1.25em; font-weight: 700; line-height: 1.3; }
              li h1, li h2, li h3 { display: inline; margin: 0; font-weight: inherit; font-size: inherit; line-height: inherit; }
            `}</style>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "#ffffff",
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
