import { ProfaneDetectOptions, DetectionResult, DetectionEntry } from "./types";
export declare class ProfaneDetect {
    private readonly bannedWords;
    private readonly homoglyphMapping;
    private readonly normalizedBannedWords;
    private readonly normalizedWhitelist;
    private readonly caseSensitive;
    private readonly whitelist;
    constructor(options?: ProfaneDetectOptions);
    private initializeNormalizedCaches;
    normalize(text: string): string;
    detect(text: string): DetectionResult;
    toJson(text: string): DetectionEntry;
    getWhitelist(): string[];
    debugMapping(char: string): string;
    private fuzzyMatch;
}
