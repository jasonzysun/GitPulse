mod ai_checks;
mod checks;
mod network_checks;

use crate::models::{DiagnosticItem, DiagnosticOptions, DiagnosticResult, DiagnosticSeverity};

pub fn run(options: DiagnosticOptions) -> DiagnosticResult {
    let items = vec![
        checks::git(),
        checks::workspace_roots(&options.root_dirs),
        checks::repo_index(&options.indexed_repos),
        checks::author(&options.author),
        checks::output_dir(&options.output_dir, options.output_enabled),
        ai_checks::ai(&options),
        checks::pdf_font(),
        network_checks::github(),
        network_checks::updater_manifest(),
    ];
    build_result(items)
}

fn build_result(items: Vec<DiagnosticItem>) -> DiagnosticResult {
    let ok_count = count_by_severity(&items, DiagnosticSeverity::Ok);
    let warning_count = count_by_severity(&items, DiagnosticSeverity::Warning);
    let error_count = count_by_severity(&items, DiagnosticSeverity::Error);
    DiagnosticResult {
        items,
        ok_count,
        warning_count,
        error_count,
    }
}

fn count_by_severity(items: &[DiagnosticItem], severity: DiagnosticSeverity) -> usize {
    items
        .iter()
        .filter(|item| item.severity == severity)
        .count()
}

fn item(
    id: &str,
    label: &str,
    severity: DiagnosticSeverity,
    message: impl Into<String>,
    action: impl Into<String>,
) -> DiagnosticItem {
    DiagnosticItem {
        id: id.to_string(),
        label: label.to_string(),
        severity,
        message: message.into(),
        action: action.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostics_reports_missing_required_workspace_fields() {
        let result = run(DiagnosticOptions {
            root_dirs: Vec::new(),
            output_dir: String::new(),
            output_enabled: true,
            author: String::new(),
            ai_enabled: false,
            ai_provider: "openai-compatible".to_string(),
            ai_base_url: String::new(),
            ai_model: String::new(),
            ai_api_key: String::new(),
            indexed_repos: Vec::new(),
        });

        assert_eq!(
            find_item(&result, "workspace-roots").severity,
            DiagnosticSeverity::Error
        );
        assert_eq!(
            find_item(&result, "output-dir").severity,
            DiagnosticSeverity::Error
        );
        // author 留空即「全部作者」语义，属合法选择，不应再计为 Error。
        assert_eq!(
            find_item(&result, "author").severity,
            DiagnosticSeverity::Ok
        );
        assert!(result.error_count >= 2);
    }

    fn find_item<'a>(result: &'a DiagnosticResult, id: &str) -> &'a DiagnosticItem {
        result
            .items
            .iter()
            .find(|item| item.id == id)
            .expect("diagnostic item should exist")
    }
}
