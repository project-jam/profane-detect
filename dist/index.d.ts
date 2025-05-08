import { ProfaneDetectOptions, DetectionResult, DetectionEntryWithFlags, WordStatus } from "./types";
export declare class ProfaneDetect {
    private readonly bannedWords;
    private readonly homoglyphMapping;
    private readonly caseSensitive;
    private readonly useFastLookup;
    private readonly fastLookup;
    private readonly userWhitelist;
    constructor(options?: ProfaneDetectOptions);
    private initializeCaches;
    normalize(text: string): string;
    detect(text: string): DetectionResult & {
        reversedMatches: string[];
    };
    checkWord(word: string): WordStatus;
    addToWhitelist(word: string): void;
    toJson(text: string): DetectionEntryWithFlags;
    debugMapping(char: string): string;
}
