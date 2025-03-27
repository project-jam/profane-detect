> [!NOTE]
> the bad words are extracted from the [profane-words](https://github.com/zacanger/profane-words) package, and modified by us
>
> including the homoglyph characters are extracted from the unicode homoglyph list, and modified by us to ensure safety

# @projectjam/profane-detect

universal profanity detection that handles obfuscated text, homoglyphs, and multiple character variations. detects attempts to bypass filters using special characters, similar-looking letters, or subtle modifications.

## features

- 🔍 robust detection of obfuscated profanity
- 🔄 homoglyph mapping (similar-looking characters)
- 📝 json output with metrics and timestamps
- ⚡ fast normalization and caching
- 🌐 unicode support
- 📦 works with esm, commonjs, and typescript

## working on

- [x] fast lookup
- [ ] universal language support
- [ ] custom homoglyph symbols
- [ ] slangs

## installation

```bash
npm install @projectjam/profane-detect
```

## usage

### basic detection

```javascript
import { ProfaneDetect } from '@projectjam/profane-detect';

const detector = new ProfaneDetect();

// simple check
const result = detector.detect("hello f*ck");
console.log(result);
/* output:
{
  found: true,
  matches: ["fuck"],
  normalized: "hello fuck",
  metrics: {
    exactMatches: 1,
    fuzzyMatches: 0,
    totalChecked: 1842
  }
}
*/
```

### json output

```javascript
const jsonResult = detector.toJson("hello f*ck");
console.log(jsonResult);
/* output:
{
  "input": "hello f*ck",
  "result": {
    "found": true,
    "matches": ["fuck"],
    "normalized": "hello fuck",
    "metrics": {
      "exactMatches": 1,
      "fuzzyMatches": 0,
      "totalChecked": 1842
    }
  },
  "timestamp": {
    "time": "15:30:45",
    "date": "1/20/2024",
    "timezone": "America/New_York"
  },
  "config": {
    "caseSensitive": false,
    "totalSafeWords": 0,
    "totalBannedWords": 1842
  }
}
*/
```

### custom configuration

```typescript
const detector = new ProfaneDetect({
  // custom safe words to ignore
  safeWords: ["grass", "assessment"],

  // case sensitive matching
  caseSensitive: true,

  // custom banned words
  bannedWords: ["bad", "words"],

  // custom character mapping
  homoglyphMapping: { 'α': 'a', 'β': 'b' }
});
```

### handles obfuscation

```javascript
// unicode fullwidth
detector.detect("ｆｕｃｋ");

// homoglyphs
detector.detect("f𝒖ck");

// separators
detector.detect("f.u.c.k");

// similar characters
detector.detect("ſuck");
```

## api reference

### constructor

```typescript
constructor(options?: {
  safeWords?: string[];
  caseSensitive?: boolean;
  bannedWords?: string[];
  homoglyphMapping?: Record<string, string>;
})
```

### methods

#### detect()
```typescript
detect(text: string): DetectionResult

interface DetectionResult {
  found: boolean;
  matches: string[];
  normalized?: string;
  metrics?: {
    exactMatches: number;
    fuzzyMatches: number;
    totalChecked: number;
  }
}
```

#### toJson()
```typescript
toJson(text: string): DetectionEntry

interface DetectionEntry {
  input: string;
  result: DetectionResult;
  timestamp: {
    time: string;
    date: string;
    timezone: string;
  };
  config: {
    caseSensitive: boolean;
    totalSafeWords: number;
    totalBannedWords: number;
  }
}
```

## fast lookup cache

the package includes a pre-built cache of common profane words for fast lookup. the cache is stored in `src/cache.json` and can be updated using the `update-cache` script.

```typescript
// enable fast lookup
const detector = new ProfaneDetect({
  useFastLookup: true,
  safeWords: ["custom", "safe", "words"]
});

// check individual words quickly
const status = detector.checkWord("someword");
console.log(status);
/* output:
{
  status: "safe" | "banned" | "pass",
  reason: string,
  originalWord?: string
}
*/

// add words to whitelist
detector.addToWhitelist("newword");

// get detailed metrics including cache hits
const result = detector.detect("some text");
console.log(result);
/* output:
{
  found: boolean,
  matches: string[],
  normalized: string,
  metrics: {
    exactMatches: number,
    fuzzyMatches: number,
    totalChecked: number,
    whitelistedSkips: number,
    lookupHits: number  // only when fast lookup is enabled
  }
}
*/
```

## contributing

pull requests are welcome. for major changes, please open an issue first to discuss what you would like to change, or [email](mailto:contact@project-jam.is-a.dev) us, we're happy to receive emails <:)

please make sure to update tests as appropriate, otherwise it may cause some issues. **oh wow! issues? GET OUT AND STOP IF YOU'RE DOING PROBLEMS WITH THE TESTS!**
