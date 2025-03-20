import { ProfaneDetectOptions, DetectionResult, DetectionEntry } from "./types";
export declare class ProfaneDetect {
    private bannedWords;
    private homoglyphMapping;
    private normalizedBannedWords;
    private normalizedSafeWords;
    private caseSensitive;
    private safeWords;
    constructor(options?: ProfaneDetectOptions);
    private cacheNormalizedSafeWords;
    private cacheNormalizedBannedWords;
    normalize(text: string): string;
    private isSafeToken;
    private fuzzyMatch;
    private isStandalone;
    detect(text: string): DetectionResult;
    toJson(text: string): DetectionEntry;
    debugMapping(char: string): string;
}
