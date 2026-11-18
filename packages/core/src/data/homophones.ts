/** Homophone groups (words that sound identical). All members are lowercase. */
const GROUPS: string[][] = [
  ['their', 'there', "they're"], ['write', 'right', 'rite'], ['to', 'too', 'two'], ['hear', 'here'],
  ['see', 'sea'], ['sun', 'son'], ['one', 'won'], ['no', 'know'], ['new', 'knew'], ['night', 'knight'],
  ['knot', 'not'], ['knit', 'nit'], ['nose', 'knows'], ['wait', 'weight'], ['way', 'weigh', 'whey'],
  ['wear', 'where', 'ware'], ['weather', 'whether'], ['which', 'witch'], ['whole', 'hole'], ['wood', 'would'],
  ['week', 'weak'], ['meet', 'meat', 'mete'], ['piece', 'peace'], ['plain', 'plane'], ['pair', 'pear', 'pare'],
  ['pain', 'pane'], ['pole', 'poll'], ['road', 'rode', 'rowed'], ['role', 'roll'], ['root', 'route'],
  ['sail', 'sale'], ['tail', 'tale'], ['steal', 'steel'], ['stair', 'stare'], ['tide', 'tied'],
  ['toe', 'tow'], ['vain', 'vein', 'vane'], ['waist', 'waste'], ['wave', 'waive'], ['bear', 'bare'],
  ['beat', 'beet'], ['bee', 'be'], ['blew', 'blue'], ['board', 'bored'], ['born', 'borne'], ['bread', 'bred'],
  ['break', 'brake'], ['buy', 'by', 'bye'], ['cell', 'sell'], ['cent', 'scent', 'sent'], ['cereal', 'serial'],
  ['chews', 'choose'], ['clothes', 'close'], ['coarse', 'course'], ['creak', 'creek'], ['dear', 'deer'],
  ['dew', 'due'], ['die', 'dye'], ['doe', 'dough'], ['eye', 'i', 'aye'], ['fair', 'fare'], ['feat', 'feet'],
  ['flour', 'flower'], ['for', 'four', 'fore'], ['gate', 'gait'], ['grate', 'great'], ['groan', 'grown'],
  ['guest', 'guessed'], ['hair', 'hare'], ['hall', 'haul'], ['heal', 'heel', "he'll"], ['heard', 'herd'],
  ['higher', 'hire'], ['him', 'hymn'], ['hour', 'our'], ['idle', 'idol'], ['in', 'inn'], ['jeans', 'genes'],
  ['key', 'quay'], ['lead', 'led'], ['lessen', 'lesson'], ['loan', 'lone'], ['made', 'maid'], ['mail', 'male'],
  ['main', 'mane'], ['mall', 'maul'], ['mind', 'mined'], ['moose', 'mousse'], ['morning', 'mourning'],
  ['muscle', 'mussel'], ['oar', 'or', 'ore'], ['pause', 'paws'], ['peak', 'peek'], ['peal', 'peel'],
  ['pedal', 'peddle'], ['principal', 'principle'], ['rain', 'reign', 'rein'], ['raise', 'rays'], ['read', 'reed'],
  ['real', 'reel'], ['ring', 'wring'], ['rap', 'wrap'], ['rest', 'wrest'], ['sauce', 'source'], ['seam', 'seem'],
  ['serf', 'surf'], ['shore', 'sure'], ['side', 'sighed'], ['sight', 'site', 'cite'], ['soar', 'sore', 'saw'],
  ['sole', 'soul'], ['some', 'sum'], ['stake', 'steak'], ['stationary', 'stationery'], ['straight', 'strait'],
  ['suite', 'sweet'], ['symbol', 'cymbal'], ['team', 'teem'], ['threw', 'through'], ['throne', 'thrown'],
  ['thyme', 'time'], ['wail', 'whale', 'wale'], ['war', 'wore'], ['ware', 'wear'], ['wine', 'whine'],
  ['yoke', 'yolk'], ['you', 'ewe', 'yew'], ['allowed', 'aloud'], ['ate', 'eight'], ['aisle', 'isle'],
  ['bald', 'bawled'], ['band', 'banned'], ['bard', 'barred'], ['berry', 'bury'], ['bored', 'board'],
  ['brows', 'browse'], ['cache', 'cash'], ['callous', 'callus'], ['cast', 'caste'], ['ceiling', 'sealing'],
  ['cheap', 'cheep'], ['chord', 'cord'], ['colonel', 'kernel'], ['complement', 'compliment'], ['council', 'counsel'],
  ['currant', 'current'], ['days', 'daze'], ['desert', 'dessert'], ['fined', 'find'], ['fir', 'fur'],
  ['flea', 'flee'], ['flew', 'flu', 'flue'], ['foul', 'fowl'], ['gorilla', 'guerrilla'], ['hoarse', 'horse'],
  ['holy', 'wholly'], ['kneed', 'need'], ['knead', 'need'], ['lain', 'lane'], ['links', 'lynx'], ['mettle', 'metal'],
  ['miner', 'minor'], ['naval', 'navel'], ['none', 'nun'], ['pail', 'pale'], ['patience', 'patients'],
  ['pi', 'pie'], ['pores', 'pours'], ['prey', 'pray'], ['profit', 'prophet'], ['rye', 'wry'], ['scene', 'seen'],
  ['sew', 'so', 'sow'], ['slay', 'sleigh'], ['stalk', 'stork'], ['tacks', 'tax'], ['taught', 'taut'],
  ['tear', 'tier'], ['toad', 'towed'], ['whirled', 'world'], ['wights', 'writes'], ['bean', 'been'],
];

/** Map word -> set of other words that sound identical. */
export const HOMOPHONES: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const m = new Map<string, Set<string>>();
  for (const g of GROUPS) {
    for (const a of g) {
      const s = m.get(a) ?? new Set<string>();
      for (const b of g) if (b !== a) s.add(b);
      m.set(a, s);
    }
  }
  return m;
})();

export function isHomophonePair(a: string, b: string): boolean {
  return HOMOPHONES.get(a)?.has(b) ?? false;
}
