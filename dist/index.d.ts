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
    private cacheNormalizedWords;
    normalize(text: string): string;
    private isWhitelisted;
    detect(text: string): DetectionResult;
    private fuzzyMatch;
    toJson(text: string): DetectionEntry;
    getWhitelist(): string[];
    debugMapping(char: string): string;
}
