use crate::zip_store::{write_zip, StoredFile};

#[derive(Clone, Copy)]
enum ParagraphKind {
    Normal,
    Heading(u8),
    Quote,
    Code,
}

struct RunSegment {
    text: String,
    bold: bool,
    code: bool,
}

pub fn markdown_to_docx(markdown: &str) -> Vec<u8> {
    let document = document_xml(markdown);
    let files = vec![
        stored("[Content_Types].xml", content_types_xml()),
        stored("_rels/.rels", root_rels_xml()),
        stored("word/_rels/document.xml.rels", document_rels_xml()),
        stored("word/styles.xml", styles_xml()),
        stored("word/document.xml", document),
    ];
    write_zip(&files)
}

fn stored(name: &str, content: String) -> StoredFile {
    StoredFile {
        name: name.to_string(),
        bytes: content.into_bytes(),
    }
}

fn document_xml(markdown: &str) -> String {
    let mut body = String::new();
    let mut in_code_block = false;

    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            in_code_block = !in_code_block;
            continue;
        }
        if trimmed.is_empty() {
            continue;
        }
        if in_code_block {
            body.push_str(&paragraph(line, ParagraphKind::Code));
            continue;
        }
        if let Some((level, text)) = heading(trimmed) {
            body.push_str(&paragraph(text, ParagraphKind::Heading(level)));
            continue;
        }
        if let Some(text) = quote(trimmed) {
            body.push_str(&paragraph(text, ParagraphKind::Quote));
            continue;
        }
        if let Some(text) = bullet(trimmed) {
            body.push_str(&paragraph(&format!("• {}", text), ParagraphKind::Normal));
            continue;
        }
        if let Some(text) = numbered(trimmed) {
            body.push_str(&paragraph(text, ParagraphKind::Normal));
            continue;
        }
        body.push_str(&paragraph(trimmed, ParagraphKind::Normal));
    }

    if body.is_empty() {
        body.push_str(&paragraph("Empty report", ParagraphKind::Normal));
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>"#,
        body
    )
}

fn paragraph(text: &str, kind: ParagraphKind) -> String {
    let ppr = paragraph_properties(kind);
    let runs = inline_runs(text, matches!(kind, ParagraphKind::Heading(_)))
        .into_iter()
        .map(run_xml)
        .collect::<String>();
    format!("<w:p>{}{}</w:p>", ppr, runs)
}

fn paragraph_properties(kind: ParagraphKind) -> String {
    match kind {
        ParagraphKind::Normal => {
            r#"<w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr>"#.to_string()
        }
        ParagraphKind::Heading(level) => format!(
            r#"<w:pPr><w:pStyle w:val="Heading{}"/><w:spacing w:before="220" w:after="120"/></w:pPr>"#,
            level.clamp(1, 3)
        ),
        ParagraphKind::Quote => {
            r#"<w:pPr><w:ind w:left="360"/><w:shd w:fill="F1F5F9"/><w:spacing w:before="80" w:after="80"/></w:pPr>"#.to_string()
        }
        ParagraphKind::Code => {
            r#"<w:pPr><w:ind w:left="240"/><w:shd w:fill="F8FAFC"/><w:spacing w:before="60" w:after="60"/></w:pPr>"#.to_string()
        }
    }
}

fn run_xml(segment: RunSegment) -> String {
    if segment.text.is_empty() {
        return String::new();
    }
    let mut props = String::new();
    if segment.bold {
        props.push_str("<w:b/>");
    }
    if segment.code {
        props.push_str(
            r#"<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:fill="EEF2F7"/>"#,
        );
    }
    let props = if props.is_empty() {
        String::new()
    } else {
        format!("<w:rPr>{}</w:rPr>", props)
    };
    format!(
        r#"<w:r>{}<w:t xml:space="preserve">{}</w:t></w:r>"#,
        props,
        escape_xml(&segment.text)
    )
}

fn inline_runs(text: &str, default_bold: bool) -> Vec<RunSegment> {
    let chars = text.chars().collect::<Vec<_>>();
    let mut runs = Vec::new();
    let mut buffer = String::new();
    let mut bold = default_bold;
    let mut code = false;
    let mut index = 0;

    while index < chars.len() {
        if !code && chars.get(index) == Some(&'*') && chars.get(index + 1) == Some(&'*') {
            push_run(&mut runs, &mut buffer, bold, code);
            bold = !bold;
            index += 2;
            continue;
        }
        if chars[index] == '`' {
            push_run(&mut runs, &mut buffer, bold, code);
            code = !code;
            index += 1;
            continue;
        }
        buffer.push(chars[index]);
        index += 1;
    }
    push_run(&mut runs, &mut buffer, bold, code);
    runs
}

fn push_run(runs: &mut Vec<RunSegment>, buffer: &mut String, bold: bool, code: bool) {
    if buffer.is_empty() {
        return;
    }
    runs.push(RunSegment {
        text: std::mem::take(buffer),
        bold,
        code,
    });
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

fn numbered(line: &str) -> Option<&str> {
    let (prefix, _) = line.split_once(' ')?;
    let marker = prefix.trim_end_matches(['.', ')']);
    (!marker.is_empty() && marker.chars().all(|char| char.is_ascii_digit())).then_some(line)
}

fn escape_xml(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn content_types_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"#
        .to_string()
}

fn root_rels_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#
        .to_string()
}

fn document_rels_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"#
        .to_string()
}

fn styles_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
</w:styles>"#
        .to_string()
}
