import { ProfaneDetectOptions, DetectionResult, DetectionEntry, WordStatus } from "./types";
export declare class ProfaneDetect {
    private readonly bannedWords;
    private readonly homoglyphMapping;
    private readonly caseSensitive;
    private readonly useFastLookup;
    private readonly fastLookup;
    private readonly userWhitelist;
    private readonly normalizedBannedWords;
    private readonly normalizedWhitelist;
    private lookupHits;
    constructor(options?: ProfaneDetectOptions);
    private initializeCaches;
    normalize(text: string): string;
    detect(text: string): DetectionResult;
    checkWord(word: string): WordStatus;
    addToWhitelist(word: string): void;
    toJson(text: string): DetectionEntry;
    debugMapping(char: string): string;
}
