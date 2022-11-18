"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.banner = void 0;
const banner = () => `[${__PROJECT__}][${new Date().toISOString().replace('T', ' ').replace(/\.\d{3}z$/i, '')}] `;
exports.banner = banner;
