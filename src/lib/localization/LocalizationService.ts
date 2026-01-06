import * as vscode from "vscode";
import { TranslationKey, TranslationMap } from "./types";
import { DEFAULT_MESSAGES } from "./messages";

export class LocalizationService {
  private static instance: LocalizationService;
  private currentLocale: TranslationMap = DEFAULT_MESSAGES;

  private constructor() {}

  public static getInstance(): LocalizationService {
    if (!LocalizationService.instance) {
      LocalizationService.instance = new LocalizationService();
    }
    return LocalizationService.instance;
  }

  public t(
    key: TranslationKey,
    params?: { [key: string]: string | number }
  ): string {
    let text = this.currentLocale[key] || DEFAULT_MESSAGES[key] || key;

    if (params) {
      Object.keys(params).forEach((param) => {
        text = text.replace(`{${param}}`, String(params[param]));
      });
    }

    return text;
  }
}
