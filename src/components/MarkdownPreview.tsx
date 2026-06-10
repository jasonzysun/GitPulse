import type { ReactNode } from "react";

type Props = {
  markdown: string;
  emptyText: string;
};

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "blockquote"; text: string }
  | { type: "code"; language: string; code: string }
  | { type: "rule" };

export function MarkdownPreview({ markdown, emptyText }: Props) {
  if (!markdown.trim()) {
    return (
      <div className="preview markdown-preview">
        <p className="preview-placeholder">{emptyText}</p>
      </div>
    );
  }

  const blocks = parseMarkdown(markdown);

  return <div className="preview markdown-preview">{blocks.map(renderBlock)}</div>;
}

function renderBlock(block: Block, index: number) {
  const key = `${block.type}-${index}`;

  if (block.type === "heading") {
    return renderHeading(block.level, block.text, key);
  }

  if (block.type === "paragraph") {
    return <p key={key}>{renderWithBreaks(block.text, key)}</p>;
  }

  if (block.type === "blockquote") {
    return <blockquote key={key}>{renderWithBreaks(block.text, key)}</blockquote>;
  }

  if (block.type === "code") {
    return (
      <pre key={key} className="md-code-block">
        <code data-language={block.language || undefined}>{block.code}</code>
      </pre>
    );
  }

  if (block.type === "rule") {
    return <hr key={key} />;
  }

  const ListTag = block.ordered ? "ol" : "ul";
  return (
    <ListTag key={key}>
      {block.items.map((item, itemIndex) => (
        <li key={`${key}-${itemIndex}`}>{renderWithBreaks(item, `${key}-${itemIndex}`)}</li>
      ))}
    </ListTag>
  );
}

function renderHeading(level: number, text: string, key: string) {
  const content = renderInline(text, key);
  if (level === 1) return <h1 key={key}>{content}</h1>;
  if (level === 2) return <h2 key={key}>{content}</h2>;
  if (level === 3) return <h3 key={key}>{content}</h3>;
  if (level === 4) return <h4 key={key}>{content}</h4>;
  if (level === 5) return <h5 key={key}>{content}</h5>;
  return <h6 key={key}>{content}</h6>;
}

function parseMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (isCodeFence(line)) {
      const [block, nextIndex] = readCodeBlock(lines, index);
      blocks.push(block);
      index = nextIndex;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    if (isBlockquote(line)) {
      const [block, nextIndex] = readBlockquote(lines, index);
      blocks.push(block);
      index = nextIndex;
      continue;
    }

    if (isUnorderedList(line) || isOrderedList(line)) {
      const [block, nextIndex] = readList(lines, index);
      blocks.push(block);
      index = nextIndex;
      continue;
    }

    const [block, nextIndex] = readParagraph(lines, index);
    blocks.push(block);
    index = nextIndex;
  }

  return blocks;
}

function readCodeBlock(lines: string[], startIndex: number): [Block, number] {
  const fenceLine = lines[startIndex].trim();
  const language = fenceLine.slice(3).trim();
  const codeLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length && !isCodeFence(lines[index])) {
    codeLines.push(lines[index]);
    index += 1;
  }

  return [{ type: "code", language, code: codeLines.join("\n") }, Math.min(index + 1, lines.length)];
}

function readBlockquote(lines: string[], startIndex: number): [Block, number] {
  const quoteLines: string[] = [];
  let index = startIndex;

  while (index < lines.length && isBlockquote(lines[index])) {
    quoteLines.push(lines[index].trimStart().replace(/^>\s?/, ""));
    index += 1;
  }

  return [{ type: "blockquote", text: quoteLines.join("\n").trim() }, index];
}

function readList(lines: string[], startIndex: number): [Block, number] {
  const ordered = isOrderedList(lines[startIndex]);
  const items: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (ordered && !isOrderedList(line)) break;
    if (!ordered && !isUnorderedList(line)) break;
    items.push(stripListMarker(line));
    index += 1;
  }

  return [{ type: "list", ordered, items }, index];
}

function readParagraph(lines: string[], startIndex: number): [Block, number] {
  const paragraphLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() || isSpecialBlockStart(line)) break;
    paragraphLines.push(line.trimEnd());
    index += 1;
  }

  return [{ type: "paragraph", text: paragraphLines.join("\n").trim() }, index];
}

function renderWithBreaks(text: string, keyPrefix: string) {
  return text.split("\n").flatMap((line, index, lines) => {
    const nodes: ReactNode[] = [];
    if (index > 0) nodes.push(<br key={`${keyPrefix}-br-${index}`} />);
    nodes.push(...renderInline(line, `${keyPrefix}-${index}`));
    if (index === lines.length - 1 && line === "") nodes.push("");
    return nodes;
  });
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/;
  let remaining = text;
  let index = 0;

  while (remaining) {
    const match = remaining.match(pattern);
    if (!match || match.index === undefined) {
      nodes.push(remaining);
      break;
    }

    if (match.index > 0) {
      nodes.push(remaining.slice(0, match.index));
    }

    nodes.push(renderInlineToken(match[0], `${keyPrefix}-${index}`));
    remaining = remaining.slice(match.index + match[0].length);
    index += 1;
  }

  return nodes;
}

function renderInlineToken(token: string, key: string) {
  const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (link) {
    return (
      <a key={key} href={link[2]} target="_blank" rel="noreferrer">
        {renderInline(link[1], `${key}-label`)}
      </a>
    );
  }

  if (token.startsWith("`") && token.endsWith("`")) {
    return <code key={key}>{token.slice(1, -1)}</code>;
  }

  if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
    return <strong key={key}>{renderInline(token.slice(2, -2), `${key}-strong`)}</strong>;
  }

  if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) {
    return <em key={key}>{renderInline(token.slice(1, -1), `${key}-em`)}</em>;
  }

  return token;
}

function isSpecialBlockStart(line: string) {
  return isCodeFence(line)
    || isBlockquote(line)
    || isUnorderedList(line)
    || isOrderedList(line)
    || isHorizontalRule(line)
    || /^(#{1,6})\s+/.test(line);
}

function isCodeFence(line: string) {
  return line.trimStart().startsWith("```");
}

function isBlockquote(line: string) {
  return /^>\s?/.test(line.trimStart());
}

function isUnorderedList(line: string) {
  return /^\s*[-*+]\s+/.test(line);
}

function isOrderedList(line: string) {
  return /^\s*\d+\.\s+/.test(line);
}

function isHorizontalRule(line: string) {
  return /^(\s*)([-*_])(\s*\2){2,}\s*$/.test(line);
}

function stripListMarker(line: string) {
  return line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "").trim();
}
