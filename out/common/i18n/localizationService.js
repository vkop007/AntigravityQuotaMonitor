"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalizationService = void 0;
const en_1 = require("./en");
class LocalizationService {
    constructor() {
        this.currentLocale = en_1.en;
        this.language = "auto";
        this.updateLocale();
    }
    static getInstance() {
        if (!LocalizationService.instance) {
            LocalizationService.instance = new LocalizationService();
        }
        return LocalizationService.instance;
    }
    setLanguage(lang) {
        this.language = lang;
        this.updateLocale();
    }
    getLanguage() {
        return this.language;
    }
    updateLocale() {
        // Simplified to always use English as it's the only supported language now
        this.currentLocale = en_1.en;
    }
    t(key, params) {
        let text = this.currentLocale[key] || en_1.en[key] || key;
        if (params) {
            Object.keys(params).forEach((param) => {
                text = text.replace(`{${param}}`, String(params[param]));
            });
        }
        return text;
    }
}
exports.LocalizationService = LocalizationService;
//# sourceMappingURL=localizationService.js.map