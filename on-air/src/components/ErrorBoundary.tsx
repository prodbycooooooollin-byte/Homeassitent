import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../lib/i18n";

/**
 * Fängt Darstellungsfehler ab, damit nie die ganze App leer wird. `scope` begrenzt den
 * Schaden auf einen Bereich (z. B. eine Ansicht); die Hintergrunddienste laufen ohnehin weiter.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; scope?: string; resetKey?: unknown }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ON AIR UI-Fehler", this.props.scope ?? "app", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    // Anderer Bereich gewählt → erneut versuchen.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card card-pad col" role="alert" style={{ gap: 10, margin: 16, maxWidth: 560 }}>
        <strong>{t("err.ui_title")}</strong>
        <p className="muted small">{t("err.ui_desc")}</p>
        <code className="small subtle" style={{ overflowWrap: "anywhere" }}>{String(this.state.error.message || this.state.error).slice(0, 300)}</code>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm" onClick={() => this.setState({ error: null })}>{t("err.ui_retry")}</button>
          <button className="btn btn-sm btn-ghost" onClick={() => window.location.reload()}>{t("err.ui_reload")}</button>
        </div>
      </div>
    );
  }
}
