import { ProfaneDetectOptions, DetectionResult, DetectionEntry, WordStatus } from "./types";
export declare class ProfaneDetect {
    private readonly homoglyphMapping;
    private readonly caseSensitive;
    private readonly useFastLookup;
    private readonly useReversible;
    private readonly fastLookup;
    private readonly userWhitelist;
    private readonly bannedMap;
    private readonly whitelistSet;
    constructor(options?: ProfaneDetectOptions);
    /** Primary normalize: maps digits → primary letters */
    private normalize;
    /** Expand digit variants only for obfuscated/reversible checks */
    private expandVariants;
    detect(text: string): DetectionResult;
    checkWord(word: string): WordStatus;
    addToWhitelist(word: string): void;
    toJson(text: string): DetectionEntry;
    debugMapping(char: string): string;
}
