# One-off: Cloak & Candle → The Betrayal. Rewrites only what people read: JS string literals (outside HTML tags and
# ${…}), HTML text and a few attributes (alt, title, aria-label, placeholder, content), and Markdown. Code, keys, class
# names and saved-game values are never touched, so games in progress still load.
#   python3 tools/rebrand.py FILE…
import re, sys

W = r"(?<![\w#./-])"          # not inside an identifier, a path, a hash or a class name
E = r"(?![\w-])"
R = [
    # the name
    (r"Cloak &amp; Candle", "The Betrayal"), (r"Cloak & Candle", "The Betrayal"), (r"Cloak and Candle", "The Betrayal"),
    (r"cloakandcandle\.co\.uk", "thebetrayal.co.uk"),
    # awards (before the words inside them change)
    (r"The Deciding Blade", "The Deciding Vote"), (r"The Prophet", "The Confessor"), (r"Mission Machine", "Trial Machine"),
    (r"The Shield Bearer", "Sanctuary Seeker"), (r"The Point Hoarder", "The Hoarder"), (r"Last Candle Burning", "Last Oath Standing"),
    # scenes and votes
    (r"The Cloak Is Given", "The Sacrament"), (r"End or Exile", "Trust or Doubt"), (r"end or exile", "trust or doubt"),
    (r"\bshare or take\b", "honour or betray"), (r"\bShare or take\b", "Honour or betray"), (r"\bShare, or take\?", "Honour, or betray?"), (r"\bshare, or take\?", "honour, or betray?"),
    (r"\bEND\b", "TRUST"), (r"\bEXILE\b", "DOUBT"), (r"\bSHARE\b", "HONOUR"), (r"\bTAKE\b", "BETRAY"),
    (r"\bPOT or SHIELD\b", "PURSE or SANCTUARY"), (r"\bPOT\b", "PURSE"), (r"\bSHIELD\b", "SANCTUARY"),
    # roles
    (r"\bthe Cloaks’", "the Forsworn’s"), (r"\bThe Cloaks’", "The Forsworn’s"), (r"\bCloaks’", "Forsworn’s"), (r"\bCloaks'", "Forsworn's"),
    (r"\ba Cloak’s\b", "a Forsworn’s"), (r"\ba Cloak's\b", "a Forsworn's"), (r"\bA Cloak’s\b", "A Forsworn’s"), (r"\bCloak’s\b", "Forsworn’s"), (r"\bCloak's\b", "Forsworn's"),
    (r"\bCloaks\b", "Forsworn"), (r"\bCloak\b", "Forsworn"),
    (r"\bthe Candles’ ", "the Loyal’s "), (r"\bCandles’", "Loyal’"),
    (r"\b(two|three|four|five|six|several|different|other|many|more|fewer|some) Candles\b", r"\1 Loyal players"), (r"\banother Candle\b", "another Loyal player"),
    (r"\bprize pot\b", "Purse"),
    (r"\ba Candle’s\b", "a Loyal player’s"), (r"\ba Candle's\b", "a Loyal player's"), (r"\bCandle’s\b", "Loyal player’s"), (r"\bCandle's\b", "Loyal player's"),
    (r"\bdied a Candle\b", "died Loyal"), (r"\bdie a Candle\b", "die Loyal"), (r"\bstays a Candle\b", "stays Loyal"), (r"\bstay a Candle\b", "stay Loyal"),
    (r"\bis a Candle\b", "is Loyal"), (r"\bwas a Candle\b", "was Loyal"), (r"\bas a Candle\b", "as one of the Loyal"),
    (r"\ba Candle\b", "a Loyal player"), (r"\bA Candle\b", "A Loyal player"), (r"\bone Candle\b", "one Loyal player"), (r"\bOne Candle\b", "One Loyal player"),
    (r"\bCandles\b", "Loyal"), (r"\bCandle\b", "Loyal"),
    # powers and twists
    (r"\bthe Champion\b", "the Crown"), (r"\bThe Champion\b", "The Crown"), (r"\ba Champion\b", "the Crown"), (r"\bA Champion\b", "The Crown"), (r"\bChampion’s\b", "Crown’s"), (r"\bChampion\b", "Crown"),
    (r"\bthe Witness\b", "the Confessor"), (r"\bThe Witness\b", "The Confessor"), (r"\bWitness\b", "Confessor"),
    (r"\bthe Dilemma\b", "the Temptation"), (r"\bThe Dilemma\b", "The Temptation"), (r"\bDilemma\b", "Temptation"),
    (r"\ba Conversion\b", "a Whisper"), (r"\bthe Conversion\b", "the Whisper"), (r"\bConversions\b", "Whispers"), (r"\bConversion\b", "Whisper"),
    (r"\ba Bargain\b", "a Last Offer"), (r"\bthe Bargain\b", "the Last Offer"), (r"\bThe Bargain\b", "The Last Offer"), (r"\bBargain\b", "Last Offer"),
    (W + r"side-quests" + E, "Errands"), (W + r"side-quest" + E, "Errand"), (W + r"Side-quests" + E, "Errands"), (W + r"Side-quest" + E, "Errand"),
    (W + r"a shield" + E, "Sanctuary"), (W + r"the shield" + E, "Sanctuary"), (W + r"The shield" + E, "Sanctuary"), (W + r"A shield" + E, "Sanctuary"),
    (W + r"shields" + E, "Sanctuaries"), (W + r"Shields" + E, "Sanctuaries"), (W + r"shield" + E, "Sanctuary"), (W + r"Shield" + E, "Sanctuary"),
    (r"the word ‘blade’", "the words ‘Casting Vote’"), (W + r"a blade" + E, "the Casting Vote"), (W + r"the blade" + E, "the Casting Vote"), (W + r"The blade" + E, "The Casting Vote"), (W + r"blades" + E, "Casting Votes"),
    (W + r"blade" + E, "Casting Vote"), (W + r"Blade" + E, "Casting Vote"),
    (W + r"the mingle" + E, "the Interval"), (W + r"The mingle" + E, "The Interval"), (W + r"a mingle" + E, "an Interval"), (W + r"A mingle" + E, "An Interval"), (W + r"mingle" + E, "Interval"), (W + r"Mingle" + E, "Interval"),
    (W + r"missions" + E, "Trials"), (W + r"Missions" + E, "Trials"), (W + r"mission" + E, "Trial"), (W + r"Mission" + E, "Trial"),
    (W + r"the pot" + E, "the Purse"), (W + r"The pot" + E, "The Purse"), (W + r"pot" + E, "Purse"), (W + r"Pot" + E, "Purse"),
    (W + r"the host’s" + E, "the Keeper’s"), (W + r"The host’s" + E, "The Keeper’s"), (W + r"the host's" + E, "the Keeper's"),
    (W + r"the host" + E, "the Keeper"), (W + r"The host" + E, "The Keeper"), (W + r"hosts" + E, "Keepers"), (W + r"host" + E, "Keeper"), (W + r"Host" + E, "Keeper"),
    (W + r"party passes" + E, "Invitations"), (W + r"party pass" + E, "Invitation"), (W + r"Party pass" + E, "Invitation"),
    # the Candles' candles are fine; the cloak as an object goes
    (r"\bpull the cloak away\b", "break the oath"), (r"\bpulled away\b", "unmasked"),
]
R = [(re.compile(a), b) for a, b in R]
ATTR = re.compile(r'((?:alt|title|aria-label|placeholder|content)=")([^"]*)(")')
TAG = re.compile(r"<[^<>]*>")

def words(t):
    for a, b in R: t = a.sub(b, t)
    # "a Trial" not "a Trial" is fine; fix articles the swaps broke
    t = re.sub(r"\ba (Interval|Errand|Invitation|Offer)\b", r"an \1", t)
    t = re.sub(r"\bA (Interval|Errand|Invitation)\b", r"An \1", t)
    t = re.sub(r"\ban (Trial|Purse|Keeper|Sanctuary|Forsworn|Loyal player|Whisper|Last Offer)\b", r"a \1", t)
    t = re.sub(r"\bthe the\b", "the", t); t = re.sub(r"\bThe the\b", "The", t); t = re.sub(r"\ba the\b", "the", t)
    return t

def prose(t, code_string=False):
    # a JS string with no space and no capital is a key or a class name: leave it
    if code_string and " " not in t and (not re.search(r"[A-Z]", t) or re.search(r"[()=;{}\[\]'.:/_$]", t)): return t
    # a template literal is cut by ${…}: a tag may start in one piece and end in the next. Leave both halves alone.
    head = ""
    j = t.find(">")
    if j >= 0 and "<" not in t[:j]: head, t = t[:j + 1], t[j + 1:]
    tail = ""
    k = t.rfind("<")
    if k >= 0 and ">" not in t[k:]: t, tail = t[:k], t[k:]
    return head + prose_(t) + tail

def prose_(t):
    out, i = [], 0
    for m in TAG.finditer(t):
        out.append(words(t[i:m.start()])); out.append(ATTR.sub(lambda a: a.group(1) + words(a.group(2)) + a.group(3), m.group(0))); i = m.end()
    out.append(words(t[i:])); return "".join(out)

def js(src):
    out, i, n = [], 0, len(src); stack = []  # stack of "tmpl" / "brace"
    def regex_ok(j):
        k = j - 1
        while k >= 0 and src[k] in " \t\n": k -= 1
        return k < 0 or src[k] in "(,=:[!&|?{};+-*%<>~^" or src[k - 5:k + 1] == "return"
    buf = []
    while i < n:
        c = src[i]
        if stack and stack[-1] == "tmpl":
            j = i; seg = []
            while j < n and src[j] != "`" and not (src[j] == "$" and j + 1 < n and src[j + 1] == "{"):
                if src[j] == "\\": seg.append(src[j:j + 2]); j += 2; continue
                seg.append(src[j]); j += 1
            out.append(prose("".join(seg)))
            if j >= n: break
            if src[j] == "`": out.append("`"); stack.pop(); i = j + 1
            else: out.append("${"); stack.append("brace"); i = j + 2
            continue
        if c == "`": out.append(c); stack.append("tmpl"); i += 1; continue
        if c == "{" and stack: stack.append("brace"); out.append(c); i += 1; continue
        if c == "}" and stack and stack[-1] == "brace": stack.pop(); out.append(c); i += 1; continue
        if c in "\"'":
            j = i + 1; seg = []
            while j < n and src[j] != c:
                if src[j] == "\\": seg.append(src[j:j + 2]); j += 2; continue
                seg.append(src[j]); j += 1
            out.append(c + prose("".join(seg), True) + c); i = j + 1; continue
        if src.startswith("//", i): j = src.find("\n", i); j = n if j < 0 else j; out.append(src[i:j]); i = j; continue
        if src.startswith("/*", i): j = src.find("*/", i) + 2; out.append(src[i:j]); i = j; continue
        if c == "/" and regex_ok(i):
            j = i + 1; cls = False
            while j < n and (src[j] != "/" or cls):
                if src[j] == "\\": j += 2; continue
                if src[j] == "[": cls = True
                elif src[j] == "]": cls = False
                elif src[j] == "\n": break
                j += 1
            out.append(src[i:j + 1]); i = j + 1; continue
        out.append(c); i += 1
    return "".join(out)

def html(src):
    # text and attributes of an HTML page; <script> bodies go through js(), <style> is left alone
    out, i = [], 0
    for m in re.finditer(r"(<script[^>]*>)(.*?)(</script>)|(<style[^>]*>.*?</style>)", src, re.S):
        out.append(prose(src[i:m.start()]))
        out.append(m.group(1) + js(m.group(2)) + m.group(3) if m.group(1) else m.group(4)); i = m.end()
    out.append(prose(src[i:])); return "".join(out)

def soft(p, pairs, regex=()):
    s = open(p, encoding="utf-8").read()
    for a, b in pairs:
        if a in s: s = s.replace(a, b)
        else: print("  (already right or missing)", p, "·", a[:60])
    for a, b in regex: s = re.sub(a, b, s)
    open(p, "w", encoding="utf-8").write(s)

LEGAL = [(re.compile(a), b) for a, b in [(r"Cloak &amp; Candle", "The Betrayal"), (r"Cloak & Candle", "The Betrayal"), (r"cloakandcandle\.co\.uk", "thebetrayal.co.uk"),
    (r"\bparty passes\b", "Invitations"), (r"\bparty pass\b", "Invitation"), (r"\bParty pass\b", "Invitation"), (r"\ba Invitation\b", "an Invitation"), (r"\bA Invitation\b", "An Invitation")]]
def legal(t):
    for a, b in LEGAL: t = a.sub(b, t)
    return t

def md(src):
    # Markdown prose; code blocks and `inline code` stay as they are
    parts = re.split(r"(```.*?```|`[^`\n]*`)", src, flags=re.S)
    return "".join(p if p.startswith("`") else words(p) for p in parts)

if __name__ == "__main__":
    if sys.argv[1] == "--legal":
        for f in sys.argv[2:]:
            s = open(f, encoding="utf-8").read(); t = legal(s)
            if t != s: open(f, "w", encoding="utf-8").write(t); print("rebranded (name only)", f)
        sys.exit()
    for f in sys.argv[1:]:
        s = open(f, encoding="utf-8").read()
        t = js(s) if f.endswith((".js", ".mjs")) else html(s) if f.endswith(".html") else md(s)
        if t != s: open(f, "w", encoding="utf-8").write(t); print("rebranded", f)
