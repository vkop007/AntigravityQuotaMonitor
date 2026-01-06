"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalizationService = void 0;
const messages_1 = require("./messages");
class LocalizationService {
    constructor() {
        this.currentLocale = messages_1.DEFAULT_MESSAGES;
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
        this.currentLocale = messages_1.DEFAULT_MESSAGES;
    }
    t(key, params) {
        let text = this.currentLocale[key] || messages_1.DEFAULT_MESSAGES[key] || key;
        if (params) {
            Object.keys(params).forEach((param) => {
                text = text.replace(`{${param}}`, String(params[param]));
            });
        }
        return text;
    }
}
exports.LocalizationService = LocalizationService;
//# sourceMappingURL=LocalizationService.js.map