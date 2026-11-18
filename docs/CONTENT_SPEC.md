# Content Spec: 366-day Word Bank (1830 words)

Audience: Std 5 students in Maharashtra State Board schools (age 10-11, mostly Marathi-medium or semi-English), learning English as a second language. Words show up as **5 new words per day for 366 days**.

Validator: `node scripts/validate-words.mjs` (full) or `--part N` (one file). A part is **done** only when `node scripts/validate-words.mjs --part N` prints `OK`.

## 1. Files and day ranges (no overlap)

Each content agent owns **exactly one file** and **only** the days listed for it. 61 days × 5 words = **305 words per file**. 6 × 305 = **1830**.

| File | Days | Difficulty mix per day (easy/medium/hard) | Part totals (E/M/H) | Term focus (suggested themes, not exclusive) |
|---|---|---|---|---|
| `content/words/part-01.json` | 1-61 | 2 / 3 / 0 | 122 / 183 / 0 | family, home, school, friends, food, body-health, clothes |
| `content/words/part-02.json` | 62-122 | 2 / 2 / 1 | 122 / 122 / 61 | animals, birds-insects, plants-trees, nature, weather-seasons |
| `content/words/part-03.json` | 123-183 | 1 / 3 / 1 | 61 / 183 / 61 | farming-village, water-rivers-sea, festivals, maharashtra-culture, india |
| `content/words/part-04.json` | 184-244 | 1 / 2 / 2 | 61 / 122 / 122 | transport-travel, city-town, community-helpers, jobs-work, safety |
| `content/words/part-05.json` | 245-305 | 1 / 2 / 2 | 61 / 122 / 122 | emotions-feelings, character-values, stories-imagination, communication, sports-games, music-art |
| `content/words/part-06.json` | 306-366 | 0 / 3 / 2 | 0 / 183 / 122 | science-space, environment, technology, describing-things, time-numbers |

The mix is checked **per day** and is how difficulty ramps across the year (average difficulty per day rises from 1.6 to 2.4). Every part may also use the general themes (`actions-movement`, `describing-things`, `shapes-colours`, `time-numbers`) where they fit.

## 2. Entry schema

Each file is a JSON array of entries. Sort by `dayIndex`, then slot. UTF-8, 2-space indent.

```json
{
  "id": "d306-1",
  "dayIndex": 306,
  "word": "brave",
  "partOfSpeech": "adjective",
  "difficulty": 2,
  "meaning": "not afraid to do something difficult or dangerous",
  "meaningMarathi": "शूर, धाडसी",
  "exampleSentence": "The brave girl jumped into the river to save the puppy.",
  "distractorMeanings": ["very tired after a long day", "making a lot of loud noise"],
  "syllables": ["brave"],
  "tags": ["character-values", "emotions-feelings"],
  "contextWords": ["soldier", "fight", "fear", "save", "danger", "courage"],
  "forms": []
}
```

(Also in `content/words/_example.json`. The validator ignores files whose names start with `_`.)

| Field | Type | Rule (validator-enforced unless marked *guideline*) |
|---|---|---|
| `id` | string | `d` + 3-digit day + `-` + slot 1-5, e.g. `d007-3`. Day must equal `dayIndex`. Slots 1-5 appear once per day. |
| `dayIndex` | int | Inside the file's day range. |
| `word` | string | Lowercase `a-z` only, 3-14 letters, one word (no spaces, hyphens or apostrophes, because the spelling keyboard has only a-z). **Base form** (`run`, not `running`; `child`, not `children`). **Owned by this part** (section 3). Indian/British spelling (`colour`, `favourite`, `neighbour`). |
| `partOfSpeech` | enum | `noun` `verb` `adjective` `adverb` `preposition` `conjunction` `pronoun` `interjection`. Use the sense taught in `meaning`. Each day needs **at least 1 noun, 1 verb and 1 adjective**. |
| `difficulty` | 1-3 | See section 5. Per-day mix must match the table above exactly. |
| `meaning` | string | Simple English, **2-12 words**, Std 3 reading level, must not contain the word. Prefer "to ..." for verbs, "a/an ..." for nouns, and a plain description for adjectives. |
| `meaningMarathi` | string | Short Marathi gloss in Devanagari (1-5 words, synonyms separated by `, `). No Latin letters. *Guideline:* use common Marathi a 10-year-old knows, not Sanskritised textbook words. |
| `exampleSentence` | string | **6-14 words**, starts with a capital letter, ends with `.`, `!` or `?`, and contains the word or a regular inflection (or one listed in `forms`). Set it in an Indian child's world: Indian names (Riya, Aarav, Sai, Gauri, Om), places (Pune, the village, the market, the school ground) and food (bhakri, poha, mango). *Guideline:* the sentence should make the meaning obvious. |
| `distractorMeanings` | [string, string] | Exactly 2 **wrong** meanings, 2-12 words each, in the same style and about the same length as `meaning`, so the right answer is not obvious from its length. Neither may contain the word. *Guideline:* one should be a meaning of a different word from the same theme and one an unrelated or opposite meaning. Never make one partly true. |
| `syllables` | string[] | Spoken syllables. Must join exactly back to `word` (`["el","e","phant"]`). One-syllable words: `["brave"]`. |
| `tags` | string[] | 1-3 theme tags from the list in section 4. |
| `contextWords` | string[] | 3-6 lowercase single words that commonly appear **near** this word in a child's sentence (used by the sentence relevance score R3). Not the word itself. Use base forms. Example for `harvest`: `["farmer","crop","field","rice","wheat"]`. |
| `forms` | string[]? | Optional. **Irregular** forms only (`run` → `["ran"]`, `child` → `["children"]`, `good` → `["better","best"]`). Regular -s/-es/-ed/-ing/-er/-est/-ly forms are generated automatically. |

## 3. No-duplicate rule: hash ownership

Six agents write in parallel, so a deterministic hash decides which part may use each word: `ownerPart(word) = fnv1a32(word) % 6 + 1` (in `scripts/lib/words-common.mjs`). A word can appear only in the part that owns it, so duplicates across parts are impossible. The validator rejects words owned by another part.

Suggested workflow for the part N agent:

1. Brainstorm a large candidate list (about 2,000 or more Std 4-7 appropriate words across all themes and all three difficulty levels) and save it to a scratch file.
2. `node scripts/word-owner.mjs --part N --file candidates.txt > mine.txt`. This keeps roughly one sixth of the list.
3. From `mine.txt`, pick 305 words that meet the difficulty quotas and the POS rule. Use the term-focus themes first, then any other theme.
4. Write entries for every day. Run `node scripts/validate-words.mjs --part N` after every 10 days or so, and fix the errors.

If a quota (for example "easy") runs short, brainstorm more candidates in that band. **Do not** relabel a word's difficulty dishonestly to fill a quota.

## 4. Allowed theme tags

`family` `home` `school` `friends` `body-health` `food` `clothes` `nature` `weather-seasons` `animals` `birds-insects` `plants-trees` `farming-village` `water-rivers-sea` `festivals` `maharashtra-culture` `india` `transport-travel` `city-town` `community-helpers` `jobs-work` `sports-games` `music-art` `stories-imagination` `emotions-feelings` `character-values` `science-space` `time-numbers` `shapes-colours` `actions-movement` `communication` `environment` `safety` `technology` `describing-things`

## 5. Level and theme guidelines (Std 5, Maharashtra State Board)

**Reference level.** Balbharati *My English Coursebook* Std 5 and the surrounding Std 4-6 books. Learners range from CEFR pre-A1 to A2. The year should grow from **A1-A2 to about B1**.

| Difficulty | Meaning for this audience | Examples |
|---|---|---|
| 1 easy | High-frequency, concrete, mostly 1-2 syllables, phonetically regular. The child probably hears it in class but may not spell it. Not ultra-basic words that every Std 5 child already spells (`cat`, `dog`, `red`, `go`). | `kitchen`, `market`, `bright`, `carry`, `thirsty`, `pillow`, `bucket` |
| 2 medium | Common but less frequent, or harder to spell: silent letters, double letters, vowel teams, 2-3 syllables. Abstract words a 10-year-old uses. | `village`, `whisper`, `journey`, `honest`, `festival`, `borrow`, `gentle`, `harvest` |
| 3 hard | Stretch words: 3-4 syllables, tricky spelling, or abstract meaning that is still useful to a child. B1 level. | `enormous`, `ancient`, `celebrate`, `curious`, `environment`, `neighbour`, `disappear` |

**Choose words that:**
- Are useful in a child's own sentences: everyday life, school, home, the village and the city, nature, farming, festivals (Ganesh Chaturthi, Diwali, Gudi Padwa, Pola, Makar Sankranti, Eid, Christmas), Maharashtra (fort, Sahyadri, monsoon, wari, lezim, tamasha are allowed as tags or contexts, but the headword must be an English word), animals, transport, emotions, community, science and the environment.
- Represent spelling-pattern variety across a week (silent letters, double letters, vowel teams, -tion, -ful, -ous, -le, ph, ch, sh, th) so the spelling-error analytics have signal.
- Include all parts of speech across the year, mostly nouns, verbs and adjectives, and some adverbs.

**Avoid:**
- Proper nouns, brand names, slang, Americanisms (`candy`, `cookie`, `mom`, `color`), and archaic or literary words (`hither`, `whilst`).
- Violence, weapons, death, alcohol or tobacco, romance, religion-specific doctrine (festivals as culture are fine), caste, politics, body-shaming, and scary content. Any word with a common rude or double meaning.
- Homograph traps where the common meaning differs from the taught one (`bat` animal vs cricket bat: choose one sense and make the example sentence match it).
- Words longer than 14 letters, words that need a hyphen or apostrophe, and inflected forms as headwords.
- Near-duplicates inside your own part (e.g. both `happy` and `happily`, or both `colour` and `colourful`). The validator does not check this, so check it yourself.

**Within a day:** use 5 different starting letters if possible (helps audio discrimination), mix themes or keep one theme of the day, and include at least 1 noun, 1 verb and 1 adjective.

## 6. Validator checks (`scripts/validate-words.mjs`)

- JSON array per file; required fields; no unknown fields; types and formats as in section 2.
- `id` and `dayIndex` are consistent; days are inside the part's range; every day has exactly 5 entries with slots 1-5.
- Per-day difficulty mix is exact; every day has at least 1 noun, 1 verb and 1 adjective (a repeated first letter only gives a warning).
- Each word is owned by its part (hash); no duplicate word anywhere (case-insensitive); no duplicate id.
- `meaning` and distractors are distinct and do not contain the word; the example sentence contains the word or an inflection; syllables join back to the word; tags come from the theme list.
- Full mode: all 6 files present and exactly **1830** words. `--partial` shows progress without failing on missing days.
