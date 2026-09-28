# One-off, after tools/rebrand.py: the lines a word-for-word swap can't write — the Sacrament, the endings, Honour or
# Betray, the Crown being worn, plurals — and the content banks, of which only the game's own words change (quiz facts,
# memory walls, songs and pictures stay as they are).
import re, sys
sys.path.insert(0, "tools"); from rebrand import js, soft

# content banks: only these carry game words
p = "src/content.js"; s = open(p, encoding="utf-8").read(); out = s
for name in ["LIKELY", "QUESTS", "MISSIONS", "MODES"]:
    a = s.index("const " + name + "="); b = len(s) if name == "MODES" else s.index("\nconst ", a + 5)
    out = out.replace(s[a:b], js(s[a:b]), 1)
open(p, "w", encoding="utf-8").write(out)
soft("src/content.js", [('"Forsworn choose a Loyal player to poison.', '"The Forsworn choose a Loyal player to poison.'), ('"No poison. Forsworn invite', '"No poison. The Forsworn invite'),
    ("Loyal only see ‘nobody died", "the Loyal only see ‘nobody died"), ("Join or die. Forsworn pick", "Join or die. The Forsworn pick")])

soft("src/scripts.js", [
    ('''["Everyone","Blindfolds on. Hands on the table.","Now. Blindfolds on, everyone. Hands flat on the table. From this moment, nothing you see can be trusted."],
[h,"I am choosing the Forsworn. If you feel a tap on the shoulder, you take the cloak.","I am walking the table now. If you feel my hand on your shoulder, you take the cloak: you are a Forsworn. Say nothing. Show nothing. Your friends are about to become your prey."],''',
     '''["Everyone","The Sacrament. Blindfolds on. Hands on the table.","The Sacrament. Blindfolds on, everyone, and hands flat on the table. Now, all together, repeat after me: I swear to be loyal to this table. I swear to find the ones who lie. From this moment, nothing you see can be trusted."],
[h,"The oath is sworn. If you feel a tap on the shoulder, you swore it falsely.","I am walking the table now. If you feel my hand on your shoulder, you swore that oath falsely: you are Forsworn. Say nothing. Show nothing. Your friends are about to become your prey."],'''),
    ("Somebody at this table is already wearing the cloak. The game has begun.", "Somebody at this table has already broken their oath. The game has begun."),
    ("sit the Loyal — and the Forsworn, hidden under the cloak.", "sit the Loyal — and the Forsworn, who swore the same oath and meant none of it."),
    ("Share the prize, or take it. My phone, in secret, one at a time. All share: you split the Purse, and play rock, paper, scissors for the prize. One takes: they take it all. Two or more take… and ",
     "Honour your pact and share the prize, or betray the others and take it. My phone, in secret, one at a time. All honour: you split the Purse, and play rock, paper, scissors for the prize. One betrays: they take it all. Two or more betray… and "),
    ("Forsworn, you've hidden under the same cloak all night.", "Forsworn, you've kept the same false oath all night."),
    ("Every seal is turned and every cloak is off.", "Every seal is turned and every oath laid bare."),
    ("with you to the very end, and nobody pulled the cloak away.", "with you to the very end, and nobody saw through them."),
    ("Every cloak has been unmasked, every Forsworn exiled.", "Every false oath has been exposed, every Forsworn exiled."),
    ("Tonight: no poison — a conversion.", "Tonight: no poison — a Whisper."),
    ('"Tonight: a bargain. Choose one Loyal player.', '"Tonight: the Last Offer. Choose one Loyal player.'),
], [(r"are you a Loyal player… or a Forsworn\?", "are you Loyal… or Forsworn?"), (r"were you a Loyal player… or a Forsworn\?", "were you Loyal… or Forsworn?")])

soft("src/tv.js", [
    ("Some hide Sanctuary: Sanctuary holder cannot be poisoned that night.", "Some hide Sanctuary: whoever holds it cannot be poisoned that night."),
    ('["Between Trials", "you Interval.', '["The Interval", "comes between the Trials and the vote.'),
    ('["The Sanctuary", "", "shield"]', '["Sanctuary", "", "shield"]'),
    ('"the dilemma"', '"the temptation"'), ('c.champion ? "the champion"', 'c.champion ? "the crown"'),
    ('<div class="eyebrow">the cloaks</div><h1 class="blood md">Share or Take</h1>', '<div class="eyebrow">the forsworn</div><h1 class="blood md">Honour or Betray</h1>'),
    ('"They share: the Purse split between them', '"They all honour the pact: the Purse split between them'),
    ('(many ? "Forsworn · bargain, rd " : "Forsworn · by bargain, round ")', '(many ? "Forsworn · Last Offer, rd " : "Forsworn · by the Last Offer, round ")'),
    ('(many ? "Forsworn · converted, rd " : "Forsworn · converted, round ")', '(many ? "Forsworn · Whisper, rd " : "Forsworn · by a Whisper, round ")'),
])
soft("src/core.js", [("the Casting Vote’s vote counts twice.", "whoever holds the Casting Vote has their vote counted twice."),
    ('const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");', 'const plural = (n, w) => n + " " + w + (n === 1 || /^(Forsworn|Loyal)$/.test(w) ? "" : "s");')])

soft("src/host.js", [("Everyone else is a <b>Loyal</b>", "Everyone else is one of the <b>Loyal</b>"), ("most hand out a <b>Sanctuary</b>", "most hand out <b>Sanctuary</b>"),
    ('"Yes, Interval before each Reckoning"', '"Yes, an Interval before each Reckoning"'), ('plural(t.length, "cloak")', 'plural(t.length, "Forsworn")'), ('plural(f.length, "candle")', 'plural(f.length, "Loyal")'),
    ('"Forsworn win" : "Loyal win"', '"The Forsworn win" : "The Loyal win"')],
    [(r"All share:", "All honour:"), (r"One takes:", "One betrays:"), (r"Two or more take\b", "Two or more betray")])

# the Crown is worn, not become
for p in ["src/scripts.js", "src/core.js", "src/host.js", "src/tv.js"]:
    soft(p, [], [(r"\bis the Crown\b", "wears the Crown"), (r"\bare the Crown\b", "wear the Crown"), (r"you are tonight(['’])s Crown", r"you wear tonight\1s Crown"),
                 (r"\bis tonight(['’])s Crown", r"wears tonight\1s Crown"), (r"\bbecomes the Crown\b", "takes the Crown"), (r"\bbecome the Crown\b", "take the Crown"),
                 (r"\bbecomes tonight(['’])s Crown", r"takes tonight\1s Crown"), (r"\bOnly the Crown may\b", "Only whoever wears the Crown may"),
                 (r"\bonly the Crown may\b", "only whoever wears the Crown may"), (r"cloak &amp; candle", "the betrayal")])
