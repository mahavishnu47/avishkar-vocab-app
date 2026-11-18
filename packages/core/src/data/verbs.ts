/** ~300 common verbs (base forms) plus irregular forms, for the "contains a verb" check. */
const BASE = `
accept act add agree allow answer appear arrive ask attack bake bark be bear beat become begin believe belong bend bite blow boil borrow bounce break bring build burn bury buy call care carry catch change chase check cheer chew choose clap clean clear climb close collect come cook copy cost cough count cover crash crawl cross cry cut dance decide deliver dig dive do draw dream dress drink drive drop dry earn eat enjoy enter escape exercise expect explain fall fear feed feel fight fill find finish fit fix float fly fold follow forget forgive freeze gather get give glow go grab grow guess hang happen hate have hear help hide hit hold hope hug hunt hurry hurt jump keep kick kill kiss knock know laugh lead learn leave lend let lie lift like listen live look lose love make marry matter mean measure meet melt mend miss mix move need notice obey offer open order pack paint pass pay peel pick plan plant play please point pour practise pray prefer prepare press pretend print protect pull punish push put race rain reach read remember repair repeat reply rescue rest return ride ring rise roar roll rub run rush sail save say scare scream search see seem sell send serve set shake share shine shop shout show shut sing sink sit skip sleep slide smell smile snow sort sound speak spell spend spill spread stand start stay steal step stick stop study suggest swim swing take talk taste teach tear tell thank think throw tie touch train travel treat trust try turn understand use visit wait wake walk want wash waste watch wave wear weigh welcome win wish wonder work worry write yell
is are am was were been being has have had does did done doing goes went gone came made took gave saw ate ran sat stood wrote knew thought brought bought caught taught told felt found kept left lost met paid sent spent built began broke chose drew drank drove fell flew forgot froze grew hid held lit rang rose rode sang sank sold shook slept spoke stole swam threw woke wore won can could will would shall should may might must
`;
export const VERBS: ReadonlySet<string> = new Set(BASE.split(/\s+/).filter(Boolean));

/** True if `w` is a verb or a regular inflection of one (-s, -es, -ed, -d, -ing, doubled consonant, -ied). */
export function isVerbForm(w: string): boolean {
  if (VERBS.has(w)) return true;
  const n = w.length;
  const has = (s: string) => VERBS.has(s);
  if (n > 2 && w.endsWith('s') && has(w.slice(0, -1))) return true;
  if (n > 3 && w.endsWith('es') && has(w.slice(0, -2))) return true;
  if (n > 3 && w.endsWith('ies') && has(w.slice(0, -3) + 'y')) return true;
  if (n > 3 && w.endsWith('ied') && has(w.slice(0, -3) + 'y')) return true;
  if (n > 3 && w.endsWith('ed') && (has(w.slice(0, -2)) || has(w.slice(0, -1)))) return true;
  if (n > 4 && w.endsWith('ed') && w[n - 3] === w[n - 4] && has(w.slice(0, -3))) return true;
  if (n > 4 && w.endsWith('ing') && (has(w.slice(0, -3)) || has(w.slice(0, -3) + 'e'))) return true;
  if (n > 5 && w.endsWith('ing') && w[n - 4] === w[n - 5] && has(w.slice(0, -4))) return true;
  return false;
}
