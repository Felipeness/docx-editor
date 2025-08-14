import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  ExternalHyperlink,
  AlignmentType,
} from "docx";
import type { DocumentMeta } from "./types";

type Style = { bold?: boolean; italics?: boolean; size?: number };
// Tipo do enum (valor) de alinhamento
type AlignmentVal = (typeof AlignmentType)[keyof typeof AlignmentType];

function listLevel(li: HTMLElement): number {
  let level = 0,
    p: HTMLElement | null = li.parentElement;
  while (p) {
    const t = p.tagName.toUpperCase();
    if (t === "UL" || t === "OL") level++;
    p = p.parentElement;
  }
  return Math.max(0, level - 1);
}

function parseFontSize(px: string | null): number | undefined {
  if (!px) return;
  const m = /(\d+(\.\d+)?)px/.exec(px);
  if (!m) return;
  const pt = Math.round((parseFloat(m[1]) * 72) / 96); // px -> pt
  return Math.max(8, Math.min(96, pt));
}

function runsFromNode(
  node: Node,
  style: Style = {}
): (TextRun | ExternalHyperlink)[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (!text) return [];
    return [
      new TextRun({
        text,
        bold: !!style.bold,
        italics: !!style.italics,
        size: style.size,
      }),
    ];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();

  if (tag === "A") {
    const href = el.getAttribute("href") || "";
    const children = flatten(el, style);
    const text =
      children
        .map((r) =>
          r instanceof TextRun ? (r as any).root.options.text ?? "" : ""
        )
        .join("") || href;
    if (/^https?:\/\//i.test(href)) {
      return [
        new ExternalHyperlink({
          children: [
            new TextRun({ text, style: "Hyperlink", size: style.size }),
          ],
          link: href,
        }),
      ];
    }
    return [
      new TextRun({
        text,
        bold: !!style.bold,
        italics: !!style.italics,
        size: style.size,
      }),
    ];
  }

  const inlineSize = parseFontSize(el.style?.fontSize || null);
  const next: Style = {
    bold: style.bold || tag === "B" || tag === "STRONG",
    italics: style.italics || tag === "I" || tag === "EM",
    size: inlineSize ?? style.size,
  };

  return flatten(el, next);
}

function flatten(
  el: HTMLElement,
  style: Style
): (TextRun | ExternalHyperlink)[] {
  const out: (TextRun | ExternalHyperlink)[] = [];
  for (const child of Array.from(el.childNodes))
    out.push(...runsFromNode(child, style));
  return out;
}

function paragraphAlignmentFrom(el: HTMLElement): AlignmentVal | undefined {
  const ta = (el.style?.textAlign || "").toLowerCase();
  if (ta === "center") return AlignmentType.CENTER;
  if (ta === "right") return AlignmentType.RIGHT;
  if (ta === "justify") return AlignmentType.JUSTIFIED;
  if (ta === "left") return AlignmentType.LEFT;
}

/** Cria Paragraph para LI já com indent opcional (ex.: vindo de blockquote) */
function liToParagraph(
  li: HTMLLIElement,
  kind: "ul" | "ol",
  extraIndentLeft = 0
): Paragraph {
  const dh = li.getAttribute("data-heading");
  const level = listLevel(li);
  const children = flatten(li, {});
  const alignment = paragraphAlignmentFrom(li);

  const p: any = { children };
  if (dh === "1") p.heading = HeadingLevel.HEADING_1;
  else if (dh === "2") p.heading = HeadingLevel.HEADING_2;
  else if (dh === "3") p.heading = HeadingLevel.HEADING_3;

  if (alignment) p.alignment = alignment;
  if (extraIndentLeft > 0) p.indent = { left: extraIndentLeft };

  if (kind === "ul") p.bullet = { level };
  else p.numbering = { reference: "num", level };

  return new Paragraph(p);
}

/** Converte elemento em Paragraphs, propagando indent acumulado (p/ blockquote) */
function elementToParagraphs(el: HTMLElement, indentLeft = 0): Paragraph[] {
  const tag = el.tagName.toUpperCase();
  const alignment = paragraphAlignmentFrom(el);

  if (tag === "H1" || tag === "H2" || tag === "H3") {
    const heading =
      tag === "H1"
        ? HeadingLevel.HEADING_1
        : tag === "H2"
        ? HeadingLevel.HEADING_2
        : HeadingLevel.HEADING_3;
    const p: any = { heading, children: flatten(el, {}) };
    if (alignment) p.alignment = alignment;
    if (indentLeft > 0) p.indent = { left: indentLeft };
    return [new Paragraph(p)];
  }

  if (tag === "BLOCKQUOTE") {
    // Aumenta indent e processa filhos com indent acumulado
    const nextIndent = indentLeft + 720; // ~0.5"
    const paras: Paragraph[] = [];
    let hasElement = false;
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === Node.ELEMENT_NODE) {
        hasElement = true;
        paras.push(...elementToParagraphs(c as HTMLElement, nextIndent));
      }
    }
    if (!hasElement) {
      // Fallback: cria um parágrafo único com indent
      const p: any = {
        children: flatten(el, {}),
        indent: { left: nextIndent },
      };
      if (alignment) p.alignment = alignment;
      paras.push(new Paragraph(p));
    }
    return paras;
  }

  if (tag === "UL" || tag === "OL") {
    const kind = tag === "UL" ? "ul" : "ol";
    const out: Paragraph[] = [];
    for (const li of Array.from(el.querySelectorAll(":scope > li"))) {
      out.push(liToParagraph(li as HTMLLIElement, kind, indentLeft));
      // listas aninhadas dentro do LI (propaga indent p/ blockquote dentro de LI)
      for (const child of Array.from((li as HTMLElement).children)) {
        const t = child.tagName.toUpperCase();
        if (t === "UL" || t === "OL" || t === "BLOCKQUOTE")
          out.push(...elementToParagraphs(child as HTMLElement, indentLeft));
      }
    }
    return out;
  }

  if (tag === "P" || tag === "DIV") {
    const p: any = { children: flatten(el, {}) };
    if (alignment) p.alignment = alignment;
    if (indentLeft > 0) p.indent = { left: indentLeft };
    return [new Paragraph(p)];
  }

  // Fallback genérico
  const p: any = { children: flatten(el, {}) };
  if (alignment) p.alignment = alignment;
  if (indentLeft > 0) p.indent = { left: indentLeft };
  return [new Paragraph(p)];
}

function htmlToParagraphs(html: string): Paragraph[] {
  const dom = new DOMParser().parseFromString(html, "text/html");
  const paras: Paragraph[] = [];
  for (const b of Array.from(dom.body.children) as HTMLElement[])
    paras.push(...elementToParagraphs(b, 0));
  return paras.length ? paras : [new Paragraph({})];
}

export async function exportDocxClient(args: {
  html: string;
  meta: DocumentMeta;
}): Promise<Blob> {
  const paragraphs = htmlToParagraphs(args.html);

  const doc = new Document({
    creator: args.meta.author,
    title: args.meta.title,
    description: "Generated by Next.js + docx (fidelity+)",
    styles: {
      paragraphStyles: [
        {
          id: "Hyperlink",
          name: "Hyperlink",
          basedOn: "Normal",
          run: { color: "0000EE", underline: {} },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "num",
          levels: [
            { level: 0, format: "decimal", text: "%1." },
            { level: 1, format: "decimal", text: "%2." },
            { level: 2, format: "decimal", text: "%3." },
          ],
        },
      ],
    },
    sections: [{ properties: {}, children: paragraphs }],
  });

  return Packer.toBlob(doc);
}
