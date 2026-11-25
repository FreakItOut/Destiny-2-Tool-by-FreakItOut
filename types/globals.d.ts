// Globale Verträge der Oberfläche (nur für die Typprüfung).
// Ergänzt window-Eigenschaften, die Module zur Laufzeit anlegen.

interface I18nApi {
  setLanguage(language: string): void;
  translate(text: string): string;
  locale(): string;
}

interface Window {
  i18n?: I18nApi;
  __d2QuietUntil?: number;
  __d2ErrorRadar?: Map<string, unknown>;
  __smokeSend?: (snapshot: unknown) => void;
  __axesForward?: (payload: unknown) => void;
  __D2_READY__?: boolean;
  isTvMode?: () => boolean;
  applyAppearance?: () => void;
  enhanceTvTargets?: (root: ParentNode) => void;
  enforceTvText?: (root: ParentNode) => void;
  __inventoryCheckpoint?: unknown;
  __d2TtsEnabled?: boolean;
  __d2TtsLast?: number;
}

interface HTMLDivElement {
  _toastTimer?: ReturnType<typeof setTimeout>;
}

interface HTMLAnchorElement {
  _d2Href?: string;
}
