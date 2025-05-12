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

// Helpers to load your data files
function loadHomoglyphMapping(filePath: string): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const line of fs
    .readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)) {
    const chars = Array.from(line);
    const base = chars.find((c) => c.trim()) || chars[0];
    for (const c of chars) if (c.trim()) mapping[c] = base;
  }
  return mapping;
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

// Leetspeak digit→letter map
const digitMap: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
};

export class ProfaneDetect {
  private readonly bannedWords: string[];
  private readonly homoglyphMapping: Record<string, string>;
  private readonly caseSensitive: boolean;
  private readonly useFastLookup: boolean;
  private readonly useReversible: boolean;
  private readonly fastLookup: FastLookup = {};
  private readonly userWhitelist: Set<string> = new Set();
  private readonly normalizedBannedMap: Map<string, string> = new Map();
  private readonly normalizedWhitelist: Set<string> = new Set();

  constructor(options?: ProfaneDetectOptions) {
    this.bannedWords = options?.bannedWords || defaultBannedWords;
    this.homoglyphMapping =
      options?.homoglyphMapping || defaultHomoglyphMapping;
    this.caseSensitive = options?.caseSensitive || false;
    this.useFastLookup = options?.useFastLookup !== false;
    // default reversible = true
    this.useReversible = options?.useReversible !== false;
    this.initializeCaches(options?.safeWords);
  }

  private initializeCaches(safeWords?: string[]): void {
    // normalize banned & whitelist
    for (const w of this.bannedWords) {
      this.normalizedBannedMap.set(this.normalize(w), w);
    }
    for (const w of defaultWhitelist) {
      this.normalizedWhitelist.add(this.normalize(w));
    }

    if (this.useFastLookup) {
      for (const w of defaultWhitelist) {
        this.fastLookup[this.normalize(w)] = {
          status: "safe",
          reason: "default whitelist",
          originalWord: w,
        };
      }
      for (const w of this.bannedWords) {
        this.fastLookup[this.normalize(w)] = {
          status: "banned",
          reason: "banned word",
          originalWord: w,
        };
      }
    }

    // user-provided safe words override
    for (const w of safeWords || []) {
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

  normalize(text: string): string {
    let s = this.caseSensitive ? text : text.toLowerCase();
    s = s.normalize("NFD").replace(/[\u0300-\u036F]/g, "");
    s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");

    const out: string[] = [];
    for (const ch of Array.from(s)) {
      let c = this.homoglyphMapping[ch] || ch;
      if (digitMap[c]) c = digitMap[c]!;
      if (/[a-zA-Z]/.test(c)) out.push(c);
    }
    return out.join("");
  }

  detect(text: string): DetectionResult {
    const detected = new Set<string>();
    let whitelistedSkips = 0;
    let lookupHits = 0;

    // Prepare for O(1) checks
    const bannedKeys = this.normalizedBannedMap; // Map<string,orig>
    const bannedSet = new Set(bannedKeys.keys()); // Set<string>

    // Split on whitespace: keep tokens intact
    const rawTokens = text.split(/\s+/).filter(Boolean);

    for (const raw of rawTokens) {
      const normRaw = this.normalize(raw);

      // 1) Fast lookup / whitelist
      if (this.useFastLookup) {
        lookupHits++;
        const cached = this.fastLookup[normRaw];
        if (cached) {
          if (cached.status === "banned") detected.add(cached.originalWord!);
          else whitelistedSkips++;
          continue;
        }
      }
      if (
        this.userWhitelist.has(normRaw) ||
        this.normalizedWhitelist.has(normRaw)
      ) {
        whitelistedSkips++;
        if (this.useFastLookup) {
          this.fastLookup[normRaw] = {
            status: this.userWhitelist.has(normRaw) ? "pass" : "safe",
            reason: this.userWhitelist.has(normRaw)
              ? "user whitelist"
              : "default whitelist",
            originalWord: raw,
          };
        }
        continue;
      }

      // Strip non-letters once
      const hasSep = /[^A-Za-z]/.test(raw);
      const stripped = raw.replace(/[^A-Za-z]/g, "");
      const normStr = this.normalize(stripped);

      // 2) Obfuscated exact match
      if (hasSep && bannedSet.has(normStr)) {
        detected.add(bannedKeys.get(normStr)!);
        if (this.useFastLookup) {
          this.fastLookup[normRaw] = {
            status: "banned",
            reason: "obfuscated exact match",
            originalWord: bannedKeys.get(normStr)!,
          };
        }
        continue;
      }

      // 3) Reversible detection (plain or obfuscated)
      if (this.useReversible) {
        // reverse the LETTER-only normalized string
        const revNorm = normStr.split("").reverse().join("");
        if (bannedSet.has(revNorm)) {
          detected.add(bannedKeys.get(revNorm)!);
          if (this.useFastLookup) {
            this.fastLookup[normRaw] = {
              status: "banned",
              reason: "reversible match",
              originalWord: bannedKeys.get(revNorm)!,
            };
          }
          continue;
        }
      }

      // 4) Fallback safe cache
      if (this.useFastLookup && !this.fastLookup[normRaw]) {
        this.fastLookup[normRaw] = { status: "safe", reason: "passed checks" };
      }
    }

    return {
      found: detected.size > 0,
      matches: Array.from(detected),
      normalized: this.normalize(text),
      metrics: {
        exactMatches: detected.size,
        fuzzyMatches: 0,
        totalChecked: rawTokens.length,
        whitelistedSkips,
        lookupHits: this.useFastLookup ? lookupHits : undefined,
      },
    };
  }

  checkWord(word: string): WordStatus {
    if (!this.useFastLookup) throw new Error("Fast lookup is disabled.");
    const n = this.normalize(word);
    if (this.userWhitelist.has(n))
      return { status: "pass", reason: "user whitelist" };
    return (
      this.fastLookup[n] || { status: "safe", reason: "not found in cache" }
    );
  }

  addToWhitelist(word: string): void {
    const n = this.normalize(word);
    this.userWhitelist.add(n);
    if (this.useFastLookup) {
      this.fastLookup[n] = {
        status: "pass",
        reason: "user added",
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
        totalBannedWords: this.bannedWords.length,
        totalWhitelisted: defaultWhitelist.length,
        usingFastLookup: this.useFastLookup,
        usingReversible: this.useReversible,
        cacheSizeBytes: this.useFastLookup
          ? Buffer.from(JSON.stringify(this.fastLookup)).length
          : undefined,
      },
    };
  }

  debugMapping(char: string): string {
    const key = this.caseSensitive ? char : char.toLowerCase();
    return this.homoglyphMapping[key] || char;
  }
}
