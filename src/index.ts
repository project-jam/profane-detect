import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ProfaneDetectOptions,
  DetectionResult,
  DetectionEntry,
  FastLookup,
  WordStatus,
} from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helpers to load data
function loadHomoglyphMapping(filePath: string): Record<string, string> {
  const m: Record<string, string> = {};
  for (const line of fs
    .readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)) {
    const chars = Array.from(line);
    const base = chars.find((c) => c.trim()) || chars[0];
    for (const c of chars) if (c.trim()) m[c] = base;
  }
  return m;
}
function loadWordList(filePath: string): string[] {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

const CHAR_MAPPING_PATH = path.join(__dirname, "../raw_data/chars.txt");
const WORDS_PATH = path.join(__dirname, "../raw_data/languages/en.json");
const WHITELIST_PATH = path.join(__dirname, "../raw_data/whitelist.json");

const defaultHomoglyphMapping = loadHomoglyphMapping(CHAR_MAPPING_PATH);
const defaultBannedWords = loadWordList(WORDS_PATH);
const defaultWhitelist = loadWordList(WHITELIST_PATH);

// Primary digit→letter map (for normalize)
const digitMap: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
};
// Additional variants for obfuscation checks
const digitVariants: Record<string, string[]> = {
  "1": ["i", "u"],
  // you can add more here if needed
};

export class ProfaneDetect {
  private readonly homoglyphMapping: Record<string, string>;
  private readonly caseSensitive: boolean;
  private readonly useFastLookup: boolean;
  private readonly useReversible: boolean;
  private readonly fastLookup: FastLookup = {};
  private readonly userWhitelist: Set<string> = new Set();
  private readonly bannedMap: Map<string, string> = new Map();
  private readonly whitelistSet: Set<string> = new Set();

  constructor(options?: ProfaneDetectOptions) {
    this.homoglyphMapping =
      options?.homoglyphMapping || defaultHomoglyphMapping;
    this.caseSensitive = options?.caseSensitive ?? false;
    this.useFastLookup = options?.useFastLookup !== false;
    this.useReversible = options?.useReversible !== false;

    // Build banned & whitelist
    for (const w of options?.bannedWords || defaultBannedWords) {
      this.bannedMap.set(this.normalize(w), w);
    }
    for (const w of defaultWhitelist) {
      this.whitelistSet.add(this.normalize(w));
    }

    // Prefill fastLookup
    if (this.useFastLookup) {
      for (const w of defaultWhitelist) {
        this.fastLookup[this.normalize(w)] = {
          status: "safe",
          reason: "default whitelist",
          originalWord: w,
        };
      }
      for (const w of options?.bannedWords || defaultBannedWords) {
        const n = this.normalize(w);
        this.fastLookup[n] = {
          status: "banned",
          reason: "banned word",
          originalWord: w,
        };
      }
    }

    // User safeWords
    for (const w of options?.safeWords || []) {
      const n = this.normalize(w);
      this.userWhitelist.add(n);
      if (this.useFastLookup) {
        this.fastLookup[n] = {
          status: "pass",
          reason: "user whitelist",
          originalWord: w,
        };
      }
    }
  }

  /** Primary normalize: maps digits → primary letters */
  private normalize(text: string): string {
    let s = this.caseSensitive ? text : text.toLowerCase();
    s = s.normalize("NFD").replace(/[\u0300-\u036F]/g, "");
    s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
    const out: string[] = [];
    for (const ch of Array.from(s)) {
      const mappedGlyph = this.homoglyphMapping[ch] || ch;
      const final = digitMap[mappedGlyph] ?? mappedGlyph;
      if (/[A-Za-z]/.test(final)) out.push(final);
    }
    return out.join("");
  }

  /** Expand digit variants only for obfuscated/reversible checks */
  private expandVariants(base: string): string[] {
    const pools: string[][] = Array.from(base).map((ch) => {
      if (digitVariants[ch]) return digitVariants[ch];
      return [ch];
    });
    const res: string[] = [];
    const backtrack = (i: number, acc: string) => {
      if (i === pools.length) return void (acc && res.push(acc));
      for (const c of pools[i]) backtrack(i + 1, acc + c);
    };
    backtrack(0, "");
    return res;
  }

  detect(text: string): DetectionResult {
    const detected = new Set<string>();
    let whitelistedSkips = 0;
    let lookupHits = 0;

    const bannedKeys = this.bannedMap;
    const bannedSet = new Set(bannedKeys.keys());

    const tokens = text.split(/\s+/).filter(Boolean);
    for (const raw of tokens) {
      if (!/[A-Za-z0-9]/.test(raw)) continue;
      const normBase = this.normalize(raw);

      // 1) Fast lookup / whitelist
      if (this.useFastLookup) {
        lookupHits++;
        const entry = this.fastLookup[normBase];
        if (entry) {
          if (entry.status === "banned") {
            detected.add(entry.originalWord!);
            continue;
          }
          if (entry.status === "pass") {
            whitelistedSkips++;
            continue;
          }
        }
      }
      if (this.userWhitelist.has(normBase) || this.whitelistSet.has(normBase)) {
        whitelistedSkips++;
        if (this.useFastLookup) {
          this.fastLookup[normBase] = {
            status: "pass",
            reason: this.userWhitelist.has(normBase)
              ? "user whitelist"
              : "default whitelist",
            originalWord: raw,
          };
        }
        continue;
      }

      // 2) Check all variants for obfuscated/reversible
      const variants = this.expandVariants(normBase);
      let flagged = false;
      for (const v of variants) {
        const hadSep = /[^A-Za-z]/.test(raw);
        if (hadSep && bannedSet.has(v)) {
          detected.add(bannedKeys.get(v)!);
          flagged = true;
          break;
        }
        if (this.useReversible) {
          const rev = v.split("").reverse().join("");
          if (bannedSet.has(rev)) {
            detected.add(bannedKeys.get(rev)!);
            flagged = true;
            break;
          }
        }
      }
      if (flagged) continue;

      // 3) Fallback mark safe
      if (this.useFastLookup) {
        this.fastLookup[normBase] = { status: "safe", reason: "checked" };
      }
    }

    return {
      found: detected.size > 0,
      matches: Array.from(detected),
      normalized: this.normalize(text),
      metrics: {
        exactMatches: detected.size,
        fuzzyMatches: 0,
        totalChecked: lookupHits,
        whitelistedSkips,
        lookupHits,
      },
    };
  }

  checkWord(word: string): WordStatus {
    if (!this.useFastLookup) throw new Error("Fast lookup disabled.");
    const n = this.normalize(word);
    if (this.userWhitelist.has(n))
      return { status: "pass", reason: "user whitelist" };
    return this.fastLookup[n] || { status: "safe", reason: "not found" };
  }

  addToWhitelist(word: string): void {
    const n = this.normalize(word);
    this.userWhitelist.add(n);
    if (this.useFastLookup) {
      this.fastLookup[n] = {
        status: "pass",
        reason: "added",
        originalWord: word,
      };
    }
  }

  toJson(text: string): DetectionEntry {
    const result = this.detect(text);
    const now = new Date();
    return {
      input: text,
      result,
      timestamp: {
        time: now.toLocaleTimeString(),
        date: now.toLocaleDateString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      config: {
        caseSensitive: this.caseSensitive,
        totalSafeWords: this.userWhitelist.size,
        totalBannedWords: this.bannedMap.size,
        totalWhitelisted: defaultWhitelist.length,
        usingFastLookup: this.useFastLookup,
        usingReversible: this.useReversible,
        cacheSizeBytes: this.useFastLookup
          ? Buffer.byteLength(JSON.stringify(this.fastLookup))
          : undefined,
      },
    };
  }

  debugMapping(char: string): string {
    const key = this.caseSensitive ? char : char.toLowerCase();
    return this.homoglyphMapping[key] || char;
  }
}
