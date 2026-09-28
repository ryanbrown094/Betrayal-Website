# One-off, after tools/rebrand.py on the site: the lines that need writing, not swapping (taglines, "room" → the Table,
# the Standing Invitation), and the game's own room wording.
import sys
sys.path.insert(0, "tools"); from rebrand import soft

soft("site/index.html", [
    ('content="Every guest gets a candle. Somebody is wearing a cloak.', 'content="Everyone swore an oath. Not everyone meant it.'),
    ("Every guest gets a candle. Somebody at the table is wearing a cloak. By the end of the night, everyone will know who.", "Everyone swore an oath. Not everyone meant it. By the end of the night, everyone will know who lied."),
    ('<a class="btn ghost" href="#start">I have a pass</a>', '<a class="btn ghost" href="#start">I have an Invitation</a>'),
    ("Open your room on a laptop and cast it.", "Open your Table on a laptop and cast it."),
    ("<h2>Open your room</h2>", "<h2>Open your Table</h2>"),
    ("it opens your room, and entering it again brings the same room back.", "it opens your Table, and entering it again brings the same Table back."),
    ("Invitation or subscription code</label>", "Invitation or Standing Invitation code</label>"),
    ('placeholder="CNDL-XXXX-XXXX"', 'placeholder="XXXX-XXXX-XXXX"'),
    ('id="go">Open room</button>', 'id="go">Open my Table</button>'),
    ("One pass, one party: your room stays open for 48 hours from the moment you open it.", "One Invitation, one party: your Table stays open for 48 hours from the moment you open it."),
    ("Setting up the TV? Room code</label>", "Setting up the TV? Table code</label>"),
    ("<summary>What does a pass get me?</summary><p>One room for one party (£15).", "<summary>What does an Invitation get me?</summary><p>One Table for one party (£15)."),
    ("<summary>Does the Keeper get to play?</summary><p>The Keeper runs the game", "<summary>Does the host get to play?</summary><p>The host is the game’s <b>Keeper</b>: they run it"),
    ("Every guest has a candle burning on the TV. The Forsworn hide under the cloak. Each night a candle goes out — and the Loyal have until the last one to break the oath.",
     "It starts with an oath. Every guest swears to be loyal to the table, and a few of them don’t mean it: they are the Forsworn. Each night a candle goes out, and the Loyal have until the last one to find out who betrayed them."),
    ('say($("#passmsg"), "Opening your room…")', 'say($("#passmsg"), "Opening your Table…")'),
    ('"Room codes are six letters and numbers."', '"Table codes are six letters and numbers."'),
    ('"Enter your pass or subscription code."', '"Enter your Invitation code."'),
    ("your pass will appear here.", "your Invitation will appear here."),
    ('location.href = "/g/" + j.room + "#host"', 'location.href = "/t/" + j.room + "#keeper"'),
    ('location.href = "/g/" + room + "#host"', 'location.href = "/t/" + room + "#keeper"'),
    ('location.href = "/g/" + v', 'location.href = "/t/" + v'),
])
soft("src/host.js", [
    ('<div class="advice offer roombox"><b>Your room: ${esc(ROOM)}</b><br>On the laptop you’ll show on the TV, open <b>${esc(location.host)}/g/${esc(ROOM)}</b>. Keep this phone on <b>${esc(location.host)}/g/${esc(ROOM)}#host</b> and bookmark it.',
     '<div class="advice offer roombox"><b>Your Table: ${esc(ROOM)}</b><br>On the laptop you’ll show on the TV, open <b>${esc(location.host)}/t/${esc(ROOM)}</b>. Keep this phone on <b>${esc(location.host)}/t/${esc(ROOM)}#keeper</b> and bookmark it.'),
    ("The TV showing the room link above", "The TV showing the Table link above"),
    ("Room codes are six letters", "Table codes are six letters"),
    ("Start again from the home page with your Invitation — entering it again brings back the same room.", "Start again from the home page with your Invitation — entering it again brings back the same Table."),
])
soft("src/tv.js", [
    ('<span>room</span><b class="num">${esc(ROOM)}</b><em>Keeper: open <u>${esc(location.host)}/g/${esc(ROOM)}#host</u> on your phone</em>', '<span>table</span><b class="num">${esc(ROOM)}</b><em>Keeper: open <u>${esc(location.host)}/t/${esc(ROOM)}#keeper</u> on your phone</em>'),
    ("Check the room code — it’s six letters and numbers", "Check the Table code — it’s six letters and numbers"),
    ('<div class="eyebrow fx-fade" style="--d:1.2s">a dinner with</div>', '<div class="eyebrow fx-fade" style="--d:1.2s">an evening of</div>'),
    ('final: () => ["The End", "Every cloak comes off", "crown"]', 'final: () => ["The Unmasking", "Every oath laid bare", "crown"]'),
])

soft("site/pages/rules.html", [
    ("Everything that happens at a The Betrayal party", "Everything that happens at a night of The Betrayal"),
    ("Everyone else is a <strong>Loyal</strong>.", "Everyone else is one of the <strong>Loyal</strong>."),
    ("By day they act like Loyal and steer the vote.", "By day they act like the Loyal and steer the vote."),
    ("<div class=\"card\"><b>The Keeper</b><p>Runs the game", "<div class=\"card\"><b>The Keeper</b><p>The host, known in the game as the Keeper. Runs the game"),
    ("<p>Nobody is told how many Forsworn there are.", "<p>The night begins with <strong>the Sacrament</strong>. Every guest, blindfolded, swears an oath of loyalty to the table. As they do, the Keeper walks behind the chairs, and a tap on the shoulder makes someone Forsworn: they swore it falsely.</p>\n<p>Nobody is told how many Forsworn there are."),
    ("and most award a <strong>Sanctuary</strong>.", "and most award <strong>Sanctuary</strong>."),
    ("If the Loyal accepts, they become a Forsworn.", "If they accept, they become Forsworn."),
    ("get a particular Loyal to say the word “castle”. A completed quest counts", "get a particular Loyal player to say the word “castle”. A completed Errand counts"),
    ("<li><b>The ceremony.</b>", "<li><b>The Unmasking.</b>"),
    ("If they all share, they split", "If they all honour the pact, they split"), ("If one takes, they take everything. If two or more take,", "If one betrays, they take everything. If two or more betray,"),
])
soft("site/pages/tour.html", [
    ("<!-- title: A night at The Betrayal -->", "<!-- title: A night of The Betrayal -->"), ("<h1>A night at The Betrayal</h1>", "<h1>A night of The Betrayal</h1>"),
    ("Then blindfolds on: the Forsworn are chosen in silence and see each other for the first time.", "Then the Sacrament: blindfolded, every guest swears an oath of loyalty, and a tap on the shoulder makes a few of them Forsworn. They see each other for the first time."),
])
soft("site/pages/contact.html", [("Please include your pass code (<span", "Please include your Invitation code (<span"), ("or your room code if you have one.", "or your Table code if you have one.")])
soft("src/tv.js", [('["Forsworn", killOf() === "murder" ? "hide among you.', '["The Forsworn", killOf() === "murder" ? "hide among you.')], [(r">a dinner with<", ">an evening of<")])
soft("src/host.js", [('championPrize(m) ? "Crown and Sanctuaries" : "shields"} — mystery round', 'championPrize(m) ? "Crown and Sanctuaries" : "Sanctuaries"} — mystery round')])
