[![npm](https://nodei.co/npm/@projectjam/profane-detect.png?downloads=true&downloadrank=true&stars=true)](https://nodei.co/npm/@projectjam/profane-detect/)

> [!note]
> the bad words are extracted from the [profane-words](https://github.com/zacanger/profane-words) package and modified by us.
> homoglyph characters are extracted from the unicode homoglyph list and modified by us to ensure safety.

# @projectjam/profane-detect

universal profanity detection that handles obfuscated text, leetspeak, homoglyphs, and multiple character variations. detects attempts to bypass filters using special characters, similar-looking letters, subtle modifications, and reversed text.

## features

* 🔍 robust detection of obfuscated profanity, including **substring matches** (e.g., "fck" in "badfckword").
* 🧑‍💻 handles **leetspeak** (e.g., "f0ck" -> "fuck").
* 🔄 advanced **homoglyph mapping** (similar-looking characters).
* 🎯 reports the **most relevant banned word** based on the longest normalized match.
* ◀️ **reversed text detection** is always active (e.g., "kcuf" -> "fuck").
* 📝 json output with detailed metrics and timestamps.
* ⚡ fast normalization and optional caching for performance.
* 🌐 full unicode support.
* 📦 works with esm, commonjs, and typescript.

## working on

* [x] fast lookup
* [x] substring detection
* [x] leetspeak normalization
* [x] reversable text
* [ ] universal language support
* [ ] custom homoglyph symbols
* [ ] slang detection

## installation

```bash
npm install @projectjam/profane-detect
```

## usage

### basic detection

```javascript
import { profanedetect } from '@projectjam/profane-detect'; // note: class name is profanedetect

const detector = new profanedetect(); // default options are sensible

// example: detects "fck" within "hellfck" after normalization
const result1 = detector.detect("hello f*ck");
console.log(result1);
// expected output might look like:
// {
//   found: true,
//   matches: [ 'fuck' ], // original word from your banned list
//   normalized: 'hellofck',
//   metrics: { /* ... */ }
// }

const result2 = detector.detect("c00kiefck");
console.log(result2);
// expected output might look like:
// {
//   found: true,
//   matches: [ 'fuck' ], // matched "fck" part
//   normalized: 'cookiefck',
//   metrics: { /* ... */ }
// }
```

### json output

```javascript
import { profanedetect } from '@projectjam/profane-detect';
const detector = new profanedetect();

const jsonresult = detector.tojson("this is some f0cking text!");
console.log(jsonresult);
// will include config details like usingreversible: true
```

## custom configuration

```typescript
import { profanedetect } from '@projectjam/profane-detect';

const detector = new profanedetect({
  // custom safe words to ignore (these are normalized before use)
  safewords: ["grass", "assessment"],

  // case sensitive matching (default: false)
  casesensitive: true,

  // custom list of banned words
  bannedwords: ["newbad", "morebad"],

  // custom character mapping for homoglyphs
  homoglyphmapping: { 'α': 'a', 'β': 'b' }, // overrides or extends default

  // disable fast lookup cache (default: true)
  usefastlookup: false,

  // the usereversible option exists in types but detection of reversed text
  // is currently always active in the detect() method.
  // setting this to false will primarily affect the `usingreversible` flag in tojson() output.
  usereversible: false
});
```

## handles obfuscation

the detector is designed to catch various obfuscation techniques:

```javascript
import { profanedetect } from '@projectjam/profane-detect';
const detector = new profanedetect();

// leetspeak
console.log(detector.detect("f0ck u a55h0le")); // matches: fuck, asshole

// unicode fullwidth
console.log(detector.detect("ｆｕｃｋ")); // matches: fuck

// homoglyphs (if '𝒖' maps to 'u' in your homoglyph data)
console.log(detector.detect("f𝒖ck")); // matches: fuck

// separators (gets normalized to "fuck")
console.log(detector.detect("f.u*c_k")); // matches: fuck

// similar characters (if 'ſ' maps to 's' or 'f')
console.log(detector.detect("ſuck")); // matches: fuck (depending on mapping)

// reversed text (always checked)
console.log(detector.detect("reggin")); // matches: nigger
```

## api reference

### constructor

see `profanedetectoptions` in `src/types.ts` for all available options.

```typescript
import { profanedetect, profanedetectoptions } from '@projectjam/profane-detect';

const options: profanedetectoptions = {
  safewords: ["customsafeword"],
  casesensitive: false,
  bannedwords: ["mycustombannedword"],
  homoglyphmapping: { /* ... */ },
  usefastlookup: true,
  usereversible: true // primarily affects tojson output flag
};

const detector = new profanedetect(options);
```
refer to `src/types.ts` for `profanedetectoptions` interface details.

### methods

#### `detect(text: string): detectionresult`

analyzes the input text and returns a `detectionresult` object.
see `src/types.ts` for the `detectionresult` interface. reversed text is always checked.

#### `tojson(text: string): detectionentry`

analyzes the input text and returns a `detectionentry` object, which includes the `detectionresult` along with timestamp and configuration information.
see `src/types.ts` for the `detectionentry` interface. the `config.usingreversible` flag will reflect the state of the `usereversible` option.

#### `checkword(word: string): wordstatus`

quickly checks the status of a single, pre-normalized word using the cache (if `usefastlookup` is true). throws an error if `usefastlookup` is disabled.
see `src/types.ts` for the `wordstatus` interface.

#### `addtowhitelist(word: string): void`

adds a word to the user whitelist. the word is normalized before being added.

#### `normalize(text: string): string`

the normalization function used internally. exposed for debugging or specific use cases.

#### `debugmapping(char: string): string`

returns the character that the input `char` maps to in the homoglyph mapping (respects `casesensitive` setting).

## fast lookup cache

when `usefastlookup` is `true` (default), the detector uses an internal cache for words it has already processed and for pre-cached banned/safe words.
the user whitelist provided via `safewords` in options, or added via `addtowhitelist()`, also populates this cache with a "pass" status.

```typescript
import { profanedetect } from '@projectjam/profane-detect';

const detector = new profanedetect({
  usefastlookup: true, // default
  safewords: ["custom", "safe", "words"]
});

// add more words to the whitelist dynamically
detector.addtowhitelist("anothersafeone");

// check individual words quickly (word should be pre-normalized if checking directly)
// the checkword method normalizes its input.
const status = detector.checkword("someword");
console.log(status); // e.g., { status: 'safe', reason: 'not found in cache' }

const status2 = detector.checkword("custom");
console.log(status2); // e.g., { status: 'pass', reason: 'user whitelist' }
```

## contributing

pull requests are welcome! for major changes, please open an issue first or [email us](mailto:contact@project-jam.is-a.dev). make sure tests are updated to cover new options.
