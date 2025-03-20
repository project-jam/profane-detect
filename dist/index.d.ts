import { ProfaneDetectOptions, DetectionResult, DetectionEntry } from "./types";
export declare class ProfaneDetect {
    private bannedWords;
    private homoglyphMapping;
    private normalizedBannedWords;
    private normalizedSafeWords;
    private normalizedWhitelist;
    private caseSensitive;
    private safeWords;
    private whitelist;
    constructor(options?: ProfaneDetectOptions);
    private cacheNormalizedSafeWords;
    private cacheNormalizedBannedWords;
    private cacheNormalizedWhitelist;
    normalize(text: string): string;
    private isSafeWord;
    private isPartOfWhitelisted;
    private fuzzyMatch;
    private isStandalone;
    detect(text: string): DetectionResult;
    toJson(text: string): DetectionEntry;
    getWhitelist(): string[];
    debugMapping(char: string): string;
}
