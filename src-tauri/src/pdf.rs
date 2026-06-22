use printpdf::{
    BuiltinFont, Color, Mm, Op, ParsedFont, PdfDocument, PdfFontHandle, PdfPage, PdfSaveOptions,
    Point, Pt, Rgb, TextItem,
};
use std::{env, fs, path::PathBuf};

const PAGE_WIDTH_MM: f32 = 210.0;
const PAGE_HEIGHT_MM: f32 = 297.0;
const MARGIN_LEFT_MM: f32 = 18.0;
const MARGIN_RIGHT_MM: f32 = 18.0;
const MARGIN_TOP_MM: f32 = 20.0;
const MARGIN_BOTTOM_MM: f32 = 20.0;
const PT_TO_MM: f32 = 0.352_778;
const MM_TO_PT: f32 = 2.834_646;

#[derive(Clone, Copy)]
enum BlockKind {
    Normal,
    Heading(u8),
    Quote,
    Bullet,
    Numbered,
    Code,
    Blank,
}

struct MarkdownBlock {
    text: String,
    kind: BlockKind,
}

#[derive(Clone, Copy)]
struct TextStyle {
    font_size: f32,
    line_height: f32,
    before_mm: f32,
    after_mm: f32,
    indent_mm: f32,
    color: (f32, f32, f32),
}

pub fn markdown_to_pdf(markdown: &str) -> Result<Vec<u8>, String> {
    let blocks = markdown_blocks(markdown);
    let mut document = PdfDocument::new("GitPulse Report");
    let font = load_report_font(&mut document, markdown)?;
    let mut pages = Vec::new();
    let mut ops = Vec::new();
    let mut cursor_y = PAGE_HEIGHT_MM - MARGIN_TOP_MM;
    let mut has_content = false;

    for block in blocks {
        if matches!(block.kind, BlockKind::Blank) {
            cursor_y -= 4.0;
            if cursor_y < MARGIN_BOTTOM_MM {
                push_page(&mut pages, &mut ops);
                cursor_y = PAGE_HEIGHT_MM - MARGIN_TOP_MM;
            }
            continue;
        }

        let style = style_for(block.kind);
        cursor_y -= style.before_mm;
        let text = block_text(&block);
        let available_width = PAGE_WIDTH_MM - MARGIN_LEFT_MM - MARGIN_RIGHT_MM - style.indent_mm;
        let lines = wrap_text(&text, available_width, style.font_size);
        for line in lines {
            let line_height_mm = style.line_height * PT_TO_MM;
            if cursor_y - line_height_mm < MARGIN_BOTTOM_MM {
                push_page(&mut pages, &mut ops);
                cursor_y = PAGE_HEIGHT_MM - MARGIN_TOP_MM;
            }
            push_text_line(
                &mut ops,
                &font,
                MARGIN_LEFT_MM + style.indent_mm,
                cursor_y,
                &line,
                style,
            );
            cursor_y -= line_height_mm;
            has_content = true;
        }
        cursor_y -= style.after_mm;
    }

    if !has_content {
        push_text_line(
            &mut ops,
            &font,
            MARGIN_LEFT_MM,
            cursor_y,
            "Empty report",
            style_for(BlockKind::Normal),
        );
    }
    push_page(&mut pages, &mut ops);

    let mut warnings = Vec::new();
    Ok(document
        .with_pages(pages)
        .save(&PdfSaveOptions::default(), &mut warnings))
}

pub fn has_report_font() -> bool {
    parse_first_available_font().is_some()
}

fn load_report_font(document: &mut PdfDocument, markdown: &str) -> Result<PdfFontHandle, String> {
    if let Some(font) = parse_first_available_font() {
        return Ok(PdfFontHandle::External(document.add_font(&font)));
    }

    if markdown.is_ascii() {
        return Ok(PdfFontHandle::Builtin(BuiltinFont::Helvetica));
    }

    Err(
        "未找到可用于中文 PDF 导出的系统字体，请安装 Noto Sans SC、微软雅黑、黑体或宋体后重试。"
            .to_string(),
    )
}

fn parse_first_available_font() -> Option<ParsedFont> {
    for path in font_candidates() {
        let Ok(font_bytes) = fs::read(path) else {
            continue;
        };
        let mut warnings = Vec::new();
        if let Some(font) = ParsedFont::from_bytes(&font_bytes, 0, &mut warnings) {
            return Some(font);
        }
    }
    None
}

fn font_candidates() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(system_root) = env::var_os("SystemRoot").or_else(|| env::var_os("WINDIR")) {
        let fonts = PathBuf::from(system_root).join("Fonts");
        paths.push(fonts.join("NotoSansSC-VF.ttf"));
        paths.push(fonts.join("Noto Sans SC (TrueType).otf"));
        paths.push(fonts.join("simhei.ttf"));
        paths.push(fonts.join("simfang.ttf"));
        paths.push(fonts.join("simsun.ttc"));
        paths.push(fonts.join("msyh.ttc"));
    }
    paths.extend([
        PathBuf::from("/System/Library/Fonts/PingFang.ttc"),
        PathBuf::from("/System/Library/Fonts/STHeiti Light.ttc"),
        PathBuf::from("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        PathBuf::from("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
        PathBuf::from("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"),
    ]);
    paths
}

fn markdown_blocks(markdown: &str) -> Vec<MarkdownBlock> {
    let mut blocks = Vec::new();
    let mut in_code_block = false;

    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            in_code_block = !in_code_block;
            continue;
        }
        if trimmed.is_empty() {
            blocks.push(MarkdownBlock {
                text: String::new(),
                kind: BlockKind::Blank,
            });
            continue;
        }
        if in_code_block {
            blocks.push(MarkdownBlock {
                text: line.trim_end().to_string(),
                kind: BlockKind::Code,
            });
            continue;
        }
        if let Some((level, text)) = heading(trimmed) {
            blocks.push(MarkdownBlock {
                text: clean_inline(text),
                kind: BlockKind::Heading(level),
            });
            continue;
        }
        if let Some(text) = quote(trimmed) {
            blocks.push(MarkdownBlock {
                text: clean_inline(text),
                kind: BlockKind::Quote,
            });
            continue;
        }
        if let Some(text) = bullet(trimmed) {
            blocks.push(MarkdownBlock {
                text: clean_inline(text),
                kind: BlockKind::Bullet,
            });
            continue;
        }
        if numbered(trimmed) {
            blocks.push(MarkdownBlock {
                text: clean_inline(trimmed),
                kind: BlockKind::Numbered,
            });
            continue;
        }
        blocks.push(MarkdownBlock {
            text: clean_inline(trimmed),
            kind: BlockKind::Normal,
        });
    }

    if blocks.is_empty() {
        blocks.push(MarkdownBlock {
            text: "Empty report".to_string(),
            kind: BlockKind::Normal,
        });
    }
    blocks
}

fn block_text(block: &MarkdownBlock) -> String {
    match block.kind {
        BlockKind::Bullet => format!("- {}", block.text),
        BlockKind::Quote => format!("| {}", block.text),
        _ => block.text.clone(),
    }
}

fn style_for(kind: BlockKind) -> TextStyle {
    match kind {
        BlockKind::Heading(1) => TextStyle {
            font_size: 20.0,
            line_height: 25.0,
            before_mm: 1.0,
            after_mm: 3.0,
            indent_mm: 0.0,
            color: (0.07, 0.10, 0.16),
        },
        BlockKind::Heading(2) => TextStyle {
            font_size: 15.0,
            line_height: 20.0,
            before_mm: 3.0,
            after_mm: 1.5,
            indent_mm: 0.0,
            color: (0.10, 0.15, 0.22),
        },
        BlockKind::Heading(_) => TextStyle {
            font_size: 12.5,
            line_height: 17.0,
            before_mm: 2.0,
            after_mm: 1.0,
            indent_mm: 0.0,
            color: (0.10, 0.15, 0.22),
        },
        BlockKind::Quote => TextStyle {
            font_size: 9.5,
            line_height: 14.5,
            before_mm: 0.8,
            after_mm: 0.8,
            indent_mm: 4.0,
            color: (0.37, 0.43, 0.52),
        },
        BlockKind::Code => TextStyle {
            font_size: 9.5,
            line_height: 14.0,
            before_mm: 0.5,
            after_mm: 0.5,
            indent_mm: 4.0,
            color: (0.15, 0.18, 0.25),
        },
        BlockKind::Bullet | BlockKind::Numbered => TextStyle {
            font_size: 10.5,
            line_height: 15.0,
            before_mm: 0.3,
            after_mm: 0.3,
            indent_mm: 2.0,
            color: (0.12, 0.16, 0.23),
        },
        BlockKind::Normal | BlockKind::Blank => TextStyle {
            font_size: 10.5,
            line_height: 15.0,
            before_mm: 0.3,
            after_mm: 0.5,
            indent_mm: 0.0,
            color: (0.12, 0.16, 0.23),
        },
    }
}

fn push_text_line(
    ops: &mut Vec<Op>,
    font: &PdfFontHandle,
    x_mm: f32,
    y_mm: f32,
    text: &str,
    style: TextStyle,
) {
    let (r, g, b) = style.color;
    ops.extend([
        Op::StartTextSection,
        Op::SetTextCursor {
            pos: Point::new(Mm(x_mm), Mm(y_mm)),
        },
        Op::SetFillColor {
            col: Color::Rgb(Rgb {
                r,
                g,
                b,
                icc_profile: None,
            }),
        },
        Op::SetFont {
            font: font.clone(),
            size: Pt(style.font_size),
        },
        Op::SetLineHeight {
            lh: Pt(style.line_height),
        },
        Op::ShowText {
            items: vec![TextItem::Text(text.to_string())],
        },
        Op::EndTextSection,
    ]);
}

fn push_page(pages: &mut Vec<PdfPage>, ops: &mut Vec<Op>) {
    if ops.is_empty() {
        return;
    }
    pages.push(PdfPage::new(
        Mm(PAGE_WIDTH_MM),
        Mm(PAGE_HEIGHT_MM),
        std::mem::take(ops),
    ));
}

fn wrap_text(text: &str, available_width_mm: f32, font_size: f32) -> Vec<String> {
    let max_units = ((available_width_mm.max(30.0) * MM_TO_PT) / font_size).max(8.0);
    let mut lines = Vec::new();
    let mut current = String::new();
    let mut units = 0.0;

    for ch in text.chars() {
        let width = char_width_units(ch);
        if units + width > max_units && !current.trim().is_empty() {
            lines.push(current.trim_end().to_string());
            current.clear();
            units = 0.0;
        }
        if current.is_empty() && ch.is_whitespace() {
            continue;
        }
        current.push(ch);
        units += width;
    }

    if !current.trim().is_empty() {
        lines.push(current.trim_end().to_string());
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

fn char_width_units(ch: char) -> f32 {
    if ch.is_ascii_whitespace() {
        0.35
    } else if ch.is_ascii() {
        0.56
    } else {
        1.0
    }
}

fn heading(line: &str) -> Option<(u8, &str)> {
    let level = line.chars().take_while(|char| *char == '#').count();
    if level == 0 || level > 6 {
        return None;
    }
    let text = line[level..].trim();
    (!text.is_empty()).then_some((level.min(3) as u8, text))
}

fn quote(line: &str) -> Option<&str> {
    line.strip_prefix('>')
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn bullet(line: &str) -> Option<&str> {
    line.strip_prefix("- ")
        .or_else(|| line.strip_prefix("* "))
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn numbered(line: &str) -> bool {
    let Some((prefix, _)) = line.split_once(' ') else {
        return false;
    };
    let marker = prefix.trim_end_matches(['.', ')']);
    !marker.is_empty() && marker.chars().all(|char| char.is_ascii_digit())
}

fn clean_inline(text: &str) -> String {
    text.replace("**", "")
        .replace("__", "")
        .replace('`', "")
        .replace("&nbsp;", " ")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_to_pdf_writes_valid_pdf_bytes() {
        let bytes = markdown_to_pdf("# Weekly Report\n\n- Export PDF\n> Source: repo/main")
            .expect("ascii PDF should use system font or built-in fallback");

        assert!(bytes.starts_with(b"%PDF"));
        assert!(bytes.len() > 1_000);
    }

    #[test]
    fn markdown_to_pdf_accepts_chinese_when_system_font_exists() {
        if parse_first_available_font().is_none() {
            return;
        }

        let bytes = markdown_to_pdf("# 工作周报\n\n- 完成 PDF 导出\n> 来源：repo / main")
            .expect("system CJK font should render Chinese reports");

        assert!(bytes.starts_with(b"%PDF"));
        assert!(bytes.len() > 1_000);
    }

    #[test]
    fn wraps_mixed_width_text() {
        let lines = wrap_text("完成PDF导出并保留 Markdown 的层级结构", 36.0, 10.5);

        assert!(lines.len() > 1);
        assert!(lines.iter().all(|line| !line.trim().is_empty()));
    }
}
