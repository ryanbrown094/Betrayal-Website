/* ===== scripts: night generator, ceremonies and host lines ===== */
function nightScript(n,st){
  st=st||state;const H=()=>hostOf(st);
  const mode=n.mode,t=n.targetName||"…",tapGeneric={who:"Everyone",tv:"If you feel a tap on the shoulder, remove your blindfold and read the screen. Not a sound.",say:"I am walking the table. If you feel my hand on your shoulder, remove your blindfold and read the screen. Say nothing. Everyone else, stay exactly as you are."};
  const vName=id=>{const p=id&&P2(st,id);return p?p.name:"…"};
  // a shielded victim is never tapped, so nobody may see their name on the screen
  const murderedScreen=(id)=>{const p=id&&P2(st,id);return (n.shielded||(p&&p.shield))?{who:"Everyone",silent:true,murdered:true,tv:"Blindfolds stay on. Not a sound.",say:"Silent. They hold Sanctuary, so you tapped nobody. Wait ten seconds so the room hears nothing, then next line."}:killOf(st)==="murder"?{who:vName(id),silent:true,murdered:true,tv:vName(id)+". You have been murdered. Not a sound. Stand up, and leave the table now."+(ghostsOn(st)?" Wait with the Ghosts, away from the table: you’ll watch the rest from there.":" Your game is over — thank you for playing. Not a word to anyone still at the table."),say:"Silent. They read it, stand and leave the table. Keep your footsteps and your pace the same."}
    :{who:vName(id),silent:true,murdered:true,tv:vName(id)+". You have been poisoned. Say nothing. Blindfold back on. At dawn, when "+H()+" asks, you will announce it, say your last words — and "+(ghostsOn(st)?"join the Ghosts.":"leave the table."),say:"Silent. They read it and put the blindfold back on."}};
  const gh=ghostsOf(st).length>0;
  const R=st.round||1,G=gh?" — everyone, the Ghosts too":"";
  // a big table’s night takes more than one victim: one pass each, the Cloaks woken again for every pass after the first
  const pass=n.pass||0,kills=killsOf(n),more=pass<kills-1;
  const s=pass?[]:[{who:"Everyone",tv:gh?"Blindfolds on — Ghosts too. Hands on the table. Not a sound.":"Blindfolds on. Hands on the table. Not a sound.",say:vr(["Night has fallen on the house. Blindfolds on"+G+". Hands flat on the table. If I hear a single word, you will answer for it at dawn.","The candles are low and the house is quiet. Blindfolds on"+G+". Hands on the table. Not a sound from anyone.","Another night. Somewhere at this table, someone has been waiting all day for this. Blindfolds on"+G+". Hands flat. Silence.","The house is asleep — or pretending to be. Blindfolds on"+G+". Hands on the table. Whatever you hear, you heard nothing."],R)}];
  s.push(pass?{who:"Forsworn",tv:"Forsworn, remove your blindfolds. The night isn’t over.",say:"Forsworn — only the Forsworn — remove your blindfolds again. The night isn’t over. Not a word."}:{who:"Forsworn",tv:"Remove your blindfolds. Read the screen. Do exactly as it says.",say:"Forsworn, remove your blindfolds. Read the screen, and do exactly what it says. Not a word."});
  // the side-quest comes after they point, so the Candle it names is never tonight’s victim or target
  const questLine=n.quest&&!pass?[{who:"Forsworn",silent:true,quest:true,tv:(n.questTarget?"For "+n.questTarget+", during the next break: ":"Errand, during the next break: ")+n.quest+" Done, and it counts for you at the end. Failed, and the Purse loses "+moneyOf(st,50)+".",say:"Silent. Their Errand for the next break. Give them a moment to read it twice."}]:[];
  const pubSh=aliveOf(st).filter(p=>p.shield==="public").map(p=>p.name),shNote=pubSh.length?" Remember: "+andList(pubSh)+(pubSh.length>1?" hold Sanctuaries":" holds Sanctuary")+" — they cannot be poisoned tonight.":"";
  if(mode==="murder"){
    const pickTv=kills<2?"Tonight: a poisoning. Agree in silence, then point at your victim.":pass?"Victim "+numWord(pass+1)+" of "+numWord(kills)+". Agree in silence, then point.":"Tonight: "+numWord(kills)+" poisonings, one at a time. Agree in silence, then point at your first victim.";
    s.push({who:"Forsworn",silent:true,pick:true,tv:pickTv+" Hold it until "+H()+" nods."+shNote,say:"Silent. They read the TV. Pick the victim below as they point."},
      ...questLine,
      {who:"Forsworn",pick:true,tv:"Blindfolds on.",say:"Forsworn, blindfolds back on."},
      {...tapGeneric,tap:"victim"},
      murderedScreen(n.victimId),{who:"Everyone",silent:true,tv:"Blindfolds stay on. Not a sound.",say:killOf(st)==="murder"?"Silent. Wait until they are well clear of the table — about fifteen seconds, the same whether or not anyone left.":"Silent. Give it five seconds so nobody can tell whether anyone was tapped."});
  }else{
    s.push({who:"Forsworn",silent:true,pick:true,tv:mode==="convert"?"Tonight: no poison — a Whisper. Agree on one Loyal player to bring to your side, then point at them. Hold it until "+H()+" nods.":"Tonight: the Last Offer. Choose one Loyal player. They join you, or they die. Point at them. Hold it until "+H()+" nods."+(shNote?shNote.replace("they cannot be poisoned tonight","Sanctuary still saves them if they refuse"):""),say:"Silent. They read the TV. Pick the target below as they point."},
      ...questLine,
      {who:"Forsworn",pick:true,tv:"Blindfolds on.",say:"Forsworn, blindfolds back on."},
      {...tapGeneric,tap:"target"},
      {who:t,silent:true,answer:true,tv:mode==="convert"?t+". The Forsworn have chosen you. Accept, and from tonight you are one of them — the prize is yours only if a Forsworn survives. Refuse, and you stay Loyal — but they will know your face, and you will know nothing. Nod to accept. Shake your head to refuse.":t+". This is not an invitation. Join the Forsworn, or be poisoned tonight. Nod to join. Shake your head to die as one of the Loyal.",say:"Silent. They read the TV and nod or shake. Record their answer below."});
    if(n.answer==="yes"){
      s.push({who:t,silent:true,tv:t+" — welcome, Forsworn. Keep your blindfold off. Wait in silence.",say:"Silent. Now tap each Forsworn on the shoulder at the next line."},
        {who:"Forsworn",silent:true,tap:"cloaks",tv:"If you feel a tap on the shoulder, remove your blindfold and read the screen. Not a sound.",say:"Silent — say nothing this time. Walk the table and tap each Forsworn; they read the screen."},
        {who:"Forsworn",silent:true,tv:"Forsworn, meet your newest ally: "+t+". Look at each other. Remember. Then all of you, blindfolds on together.",say:"Silent. Let them look. When all blindfolds are back on, go to the next line."});
    }else if(n.answer==="no"){
      s.push({who:t,silent:true,tv:"Your answer is sealed. Blindfold on.",say:"Silent."+(mode==="bargain"?" They refused: the next line is the murder tap.":"")});
      if(mode==="bargain")s.push({...tapGeneric,tap:"victim"},murderedScreen(n.targetId));
    }else{
      s.push({who:"…",pending:true,tv:"…",say:"Record the answer to see the rest of the script."});
    }
  }
  if(more){s.push({who:"Everyone",silent:true,tv:"Blindfolds stay on. The night isn’t over. Not a sound.",say:"Silent. Blindfolds stay on — the Forsworn strike again. Tap “Next victim” when you’re ready."});return kwLines(s,st)}
  const dawn=killOf(st)==="murder"?["Everyone, remove your blindfolds. Dawn is coming. Say nothing yet — dawn will tell us who made it through the night.","Blindfolds off, everyone. The night is over. Not a word until dawn.","Everyone, blindfolds off. Morning is on its way, and with it, the truth. Some of it.","Blindfolds off. First light over the house. Nobody say a word about what they did or didn’t hear."]:["Everyone, remove your blindfolds. Dawn is coming. Everyone is still here. For now.","Blindfolds off, everyone. The night is over. Look around — every chair still full. For now.","Everyone, blindfolds off. Morning is on its way, and with it, the truth. Some of it.","Blindfolds off. First light over the house. Nobody say a word about what they did or didn’t hear."];
  s.push({who:"Everyone",tv:vr(["Remove your blindfolds. Dawn is coming.","Blindfolds off. The night is over.","Remove your blindfolds. Morning is on its way.","Blindfolds off. First light."],R),say:vr(dawn,R)});
  return kwLines(s,st);
}
const norm=e=>Array.isArray(e)?{who:e[0],tv:e[1],say:e[2]}:e;
// A key line has a few phrasings; each round takes the next, so no two rounds running sound the same and a line never
// changes while the host is reading it.
const vr=(a,r)=>a[((r||1)-1)%a.length];
const NIGHT0_=h=>[
["Everyone","The Sacrament. Blindfolds on. Hands on the table.","The Sacrament. Blindfolds on, everyone, and hands flat on the table. Now, all together, repeat after me: I swear to be loyal to this table. I swear to find the ones who lie. From this moment, nothing you see can be trusted."],
[h,"The oath is sworn. If you feel a tap on the shoulder, you swore it falsely.","I am walking the table now. If you feel my hand on your shoulder, you swore that oath falsely: you are Forsworn. Say nothing. Show nothing. Your friends are about to become your prey."],
["Forsworn","Remove your blindfolds. Look around. Remember what you see.","Forsworn — and only Forsworn — remove your blindfolds. Look up. Look around. Remember what you see. Tomorrow you’ll have to pretend you know nothing at all."],
["Forsworn","Blindfolds on.","Forsworn, blindfolds back on. Silently."],
["Everyone","Remove your blindfolds. The game has begun.","Everyone, remove your blindfolds. Look at each other. Somebody at this table has already broken their oath. The game has begun."]];
const BF=g=>g?"Blindfolds on — Ghosts too.":"Blindfolds on.";
// The special prize, straight after the mission: whoever won it meets the Cloak now. Nothing said aloud names it, and
// when a Cloak won it the room hears exactly the same lines — the host taps them, then walks the table tapping nobody.
const WITNESSNOW_=(h,g,c)=>{
  const f=!!c.fake,G=g?", Ghosts too":"";
  return [
    {who:"Everyone",tv:BF(g),say:"The Trial is over. Blindfolds on, everyone"+G+". Hands on the table. Not a sound."},
    {who:h,tap:"witness",tv:"If you feel a tap on the shoulder, remove your blindfold and read the screen. Not a sound.",say:"I am walking the table. If you feel my hand on your shoulder, remove your blindfold and read the screen. Say nothing."},
    {who:"Winner",silent:true,tv:f?"You won the special prize: the Confessor. But you are the Forsworn — there is nobody for you to meet. Stay perfectly still. Give nothing away.":"You won the special prize: you are the Confessor. In a moment one more person will take off their blindfold. Look at them.",say:"Silent. Let them read it twice."},
    {who:h,silent:true,tap:"cloak",tv:"If you feel a tap on the shoulder, remove your blindfold and look up. Not a sound.",say:f?"Silent. Walk the table as if you were tapping someone — tap nobody.":"Silent. Tap the Forsworn on the shoulder."},
    {who:"Both",silent:true,tv:f?"Stay still. Thirty seconds. Not a sound.":"Confessor: the other person with their blindfold off is a Forsworn. Forsworn: this person is the Confessor — they know your face now, and you cannot poison them. Thirty seconds. Not a sound.",say:"Silent. Give them thirty seconds."},
    {who:"Both",silent:true,tv:f?"Blindfold back on.":"Blindfolds on. Both of you.",say:"Silent. When the blindfolds are back on, next line."},
    {who:"Everyone",tv:"Remove your blindfolds.",say:"Blindfolds off, everyone. The special prize has been claimed. Somebody at this table knows more than they did a minute ago."}].map(l=>({...l,tv:kw(l.tv),say:kw(l.say)}));
};
const CEREMONY_=(h,g,c)=>{
  const n=c.secCount||0,war=!!c.secWar,dag=!!c.secDag,G=g?", Ghosts too":"";
  const what=[war?"the Crown":null,n?(n>1?numWord(n)+" Sanctuaries":"Sanctuary"):null,dag?"the Casting Vote":null].filter(Boolean),many=what.length>1||n>1;
  const L=[{who:"Everyone",tv:BF(g),say:"The Trial is over — and somewhere in it, "+andList(what)+(many?" were":" was")+" won in secret. Blindfolds on, everyone"+G+". Hands on the table."}];
  if(war)L.push({who:h,tap:"champion",tv:"The Crown has been chosen — Sanctuary and Casting Vote. Whoever feels a tap now wears the Crown.",say:"Whoever feels my hand on their shoulder now wears the Crown. You hold Sanctuary: the Forsworn cannot poison you tonight. And the Casting Vote: at the Reckoning your vote counts twice — when the last board is in, the table sees where it fell, never whose it was. Only you may lay both down at the table, before the first board, to be safe from the exile. Whether anyone else ever knows… is up to you."});
  if(n)L.push({who:h,tap:"shield",tv:(n>1?"Sanctuaries have":"Sanctuary has")+" been won. Whoever feels a tap now holds Sanctuary.",say:"Whoever feels my hand on their shoulder now holds Sanctuary tonight. The Forsworn cannot poison you. Whether you tell the table… is up to you."});
  if(dag)L.push({who:h,tap:"blade",tv:"The Casting Vote has been won. Whoever feels a tap now holds it.",say:"Whoever feels my hand on their shoulder now holds the Casting Vote. At tonight’s Reckoning your vote counts twice. When the last board is in, the table sees where the Casting Vote fell — never whose it was."});
  L.push({who:"Everyone",tv:"Remove your blindfolds. "+cap1(andList(what))+(many?" have":" has")+" been claimed.",say:"Blindfolds off. "+cap1(andList(what))+(many?" have":" has")+" been claimed. Look around the table. Somebody here knows something you don’t."});
  return L.map(l=>({...l,tv:kw(l.tv),say:kw(l.say)}));
};
const SHIELD0_=(h,g,n)=>n>1?[
["Everyone",BF(g),"The Trial is over — and somewhere in it, "+numWord(n)+" Sanctuaries were won. Blindfolds on, everyone"+(g?", Ghosts too":"")+". Hands on the table."],
[h,"Sanctuaries have been won. Whoever holds one will feel a tap on the shoulder.","Whoever feels my hand on their shoulder holds Sanctuary tonight. The Forsworn cannot poison you. Whether you tell the table… is up to you."],
["Everyone","Remove your blindfolds. The Sanctuaries have been claimed.","Blindfolds off. Some of you are safe tonight. The rest of you are not."]]:[
["Everyone",BF(g),"The Trial is over — and somewhere in it, Sanctuary was won in secret. Blindfolds on, everyone"+(g?", Ghosts too":"")+". Hands on the table."],
[h,"Sanctuary has been won. Whoever holds it will feel a tap on the shoulder.","Whoever feels my hand on their shoulder holds Sanctuary tonight. The Forsworn cannot poison you. Whether you tell the table… is up to you."],
["Everyone","Remove your blindfolds. Sanctuary has been claimed.","Blindfolds off. Somebody here is safe tonight. Somebody else is not."]];

const SAY={
  lobbyWait:"Take your seats, everyone, and fill your glasses. When the titles roll on the screen, the game begins.",
  lobby:"Welcome to The Betrayal. Look at the screen: there is a candle burning for every one of you. Tonight, around this table, sit the Loyal — and the Forsworn, who swore the same oath and meant none of it. Each night the Forsworn will poison one of you, and a candle will go out. Each day the Loyal must find them and exile them. Trust no one. Not the person who poured your wine. Not the person who drove you here.",
  day:r=>r>1?vr(["Round "+numWord(r)+". The table is smaller, and the Purse is still hungry. Before you can point fingers, you must earn the right. Today’s Trial…","Round "+numWord(r)+". Fewer chairs, longer memories. The Purse won’t fill itself — and a Forsworn would quite like it to stay empty. Today’s Trial…","Round "+numWord(r)+". You know each other a little better now. That should worry you. First, the Purse. Today’s Trial…"],r-1):"Good morning, and welcome to round one. Before you can point fingers, you must earn the right. The Purse only grows if you work together — which is a strange thing to ask of a table with Forsworn on it. Today’s Trial…",
  lastMission:"Five of you left. Before the last vote, one more Trial — and whatever it is worth, it may be the last thing any of you wins tonight.",
  final:"This is the final round. A last Trial, then the Reckoning — and after that, you decide whether it’s over. If a Forsworn is still sitting here when it ends, the Loyal get nothing.",
  missionDone:r=>vr(["The Trial is over. Look at the scores — and remember, a Loyal player who plays badly looks a lot like a Forsworn who’s sabotaging.","That’s the Trial. Some of you tried very hard. Some of you tried very hard to look like you were trying.","Trial over. The Purse remembers who helped it — and so should you."],r),
  afterCeremony:"Remember who played badly tonight. A Loyal player who plays badly looks a lot like a Forsworn who’s sabotaging.",
  shieldPublic:n=>n+" holds Sanctuary tonight. The Forsworn cannot touch them. Which, I suppose, means they can say whatever they like at the Reckoning.",
  // the Champion is explained when it is given, and reminded at the table
  championFull:n=>n+", you wear tonight’s Crown. You hold Sanctuary — the Forsworn cannot poison you tonight — and the Casting Vote: at the Reckoning, your vote counts twice. One more thing. At the table, before the first board turns, you may lay both down. Then nobody may chalk your name — but your vote counts once, and tonight nothing protects you. Think about when you’ll need it.",
  blade:n=>n+", you hold the Casting Vote. At tonight’s Reckoning, your vote counts twice. Use it well — everyone will be watching whose name you chalk.",
  talkChampionSecret:" And if any of you wears the Crown, won in secret: before the first board turns, you may lay down your Sanctuary and your Casting Vote, and nobody may chalk your name at this table. Say it now, or not at all. Keep them, and the Casting Vote adds one more vote to your choice when the last board is in.",
  talkBladeSecret:" And somebody here holds the Casting Vote, won in secret. It counts twice — and when the last board is in, you will all see where it fell.",
  talkBlade:n=>" And "+n+", the Casting Vote: your board counts once as it turns, like everyone’s. When the last board is in, it adds one more vote to your choice.",
  potSplit:(total,names,each)=>names.length>1?"And the Purse — "+total+" — is split between "+andList(names)+": "+each+" each.":names[0]+" takes the Purse too: "+total+".",
  talkChampion:n=>" And "+n+": you wear the Crown. Before the first board turns, you may lay down your Sanctuary and your Casting Vote — and nobody may chalk your name at this table. The choice is yours. Say it now, or not at all.",
  championLaid:(n,r)=>vr([n+" lays down Sanctuary and Casting Vote. Nobody may chalk that name at this table. But tonight, in the dark, nothing protects them — and their vote counts once.",n+" gives up Sanctuary and the Casting Vote. Safe from this table — and from nothing else. Tonight they sleep like the rest of you."],r),
  revote:n=>"A tie. So we go again — and this time the only names you may chalk are "+n+". Boards to your chest. Same as before: when I say your name, turn it.",

  stillTied:n=>"Still tied. Then it falls to everyone else: all of you except "+n+", agree one name out loud. Sixty seconds. If you can’t, I decide.",
  shieldShown:a=>andList(a)+(a.length>1?" have shown their Sanctuaries.":" has shown their Sanctuary.")+" Nobody may chalk "+(a.length>1?"those names":"that name")+" at this table. But Sanctuary shown is Sanctuary spent — tonight, in the dark, nothing protects "+(a.length>1?"them":"them")+".",
  talk:r=>vr(["Before the chalk comes out, you talk. Free for all. Accuse, defend, deflect. When the ring runs out, the talking stops and the chalk comes out — and nobody gets to change their mind after that.","The Reckoning is open. Say what you’ve been thinking all day. When the ring runs out, the talking stops, and the chalk does the rest.","Take your seats. You’ve watched each other all day — now’s the time to say it out loud. Accuse, defend, deflect. When the ring is empty, chalk.","Somebody at this table has been lying to you all day. Now’s your chance. Talk. When the ring runs out, not another word — just chalk."],r),
  dilemma:(st,st2)=>"One more decision before the table. Chalk one word: PURSE or SANCTUARY. If exactly one of you writes SANCTUARY, they hold it tonight and the Purse grows by "+st+". If nobody dares, the Purse grows by "+st2+". If two or more of you grab for it — nobody gets it, and the Purse loses "+st+". Boards face down.",
  final2:"Two of you left. Nothing more to say, nothing more to chalk. Whatever you are, we are about to find out.",
  ceremony:n=>cap1(numWord(n))+" of you, still at the table. Nothing more to say, nothing more to chalk. One at a time, you will find out what you have been sitting beside.",
  ceremonyReveal:"Say the name of the seal you’re about to turn, then: for the last time tonight — Loyal… or Forsworn?",
  countdown:n=>cap1(numWord(n))+" rounds of letters. Longest real word wins the round.",
  quiz:per=>"Three parts, "+numWord(per)+" questions each: easy, then medium, then brutal. First to shout is locked in — right or wrong.",
  get final2Cloaks(){return "You have kept each other’s secret all night. So there is one question left, and it is not about the Loyal. Honour your pact and share the prize, or betray the others and take it. My phone, in secret, one at a time. All honour: you split the Purse, and play rock, paper, scissors for the prize. One betrays: they take it all. Two or more betray… and "+(ghostsOn()?"it goes to the dead — to any Ghost who named one of you.":"nobody gets anything at all.")},
  ghostTake:n=>"The Forsworn robbed each other — so the prize passes to the dead. "+n+": you each named a Forsworn from beyond the table. Now the same question falls to you. My phone, in secret. Honour, or betray?",
  endvote:"This is the end of the road — unless you say otherwise. My phone is coming round the table. TRUST, if you believe every Forsworn is gone and you are ready to share the prize. DOUBT, if you think one still sits among you. It must be unanimous to end. Your vote stays secret until the TV turns the cards — then everyone sees who voted what.",
  endvoteExile:n=>cap1(numWord(n))+" of you want another exile. So be it. Back to the Reckoning — and make it count.",
  secondMission:r=>vr(["Not so fast. Nobody sits down yet. One Trial earns the right to point fingers; two earns the right to be believed. Back to your chalkboards — the Purse grows, and so does the list of people who played badly.","Another one. The Purse is not full, and I am not finished with you. Chalkboards.","Stay standing — well, stay seated, but stay sharp. One more Trial before the table."],r),
  dinner:m=>"Dinner. "+cap1(numWord(m))+" minutes. Sit where you like — and notice who chooses to sit next to you. A Forsworn never eats alone if they can help it.",
  mingle:(m,r)=>vr(["Up you get. "+cap1(numWord(m))+" minutes. Refill a glass, corner someone, tell a lie. Everything you say in the next "+numWord(m)+" minutes can and will be used against you at the table.","Stretch your legs. "+cap1(numWord(m))+" minutes. Find the person you trust least and ask them a question they won’t want to answer.","Break. "+cap1(numWord(m))+" minutes. Top up, pair up, whisper. The Forsworn certainly will."],r),
  table:r=>vr(["It’s time. Chalk the name of the one you suspect, and keep your board to your chest. I’ll go round the table: when I say your name, turn it — and tell them why, to their face.","Chalk in hand. One name — the one you believe is a Forsworn. Boards to your chest. When I say your name, turn it, and tell them why.","The talking is done. Write one name. Keep it hidden. I’ll come round the table: turn your board when I say your name, and look them in the eye while you explain.","One name each. Chalk it, hide it. When I call you, turn it — and say why, to their face. No speeches. Just the truth as you see it."],r),
  revealFinal:(n,r)=>vr([n+", the table has spoken. In the final there are no confessions. Stand up, say nothing, and leave the table. We find out what you were when it is over.",n+", that’s the table’s decision. No confession now — not in the final. Stand, and go without a word. The rest of us will find out at the very end."],r),
  reveal:(n,r)=>vr([n+", the table has spoken. Stand up. Before you go — tell us, honestly, for the first time tonight: are you Loyal… or Forsworn?",n+", you’ve been exiled. Stand up. No more games — tell the table what you really are. Loyal… or Forsworn?",n+". The house has decided. Please stand. For once tonight, there’s no point lying: were you Loyal… or Forsworn?",n+", your candle is going out. On your feet. Tell them — and look at the people who chalked your name while you do. Loyal, or Forsworn?"],r),
  dawnAsk:r=>killOf()==="murder"?vr(["Good morning. I hope you all slept well. Look around the table. Is every chair still full?","Good morning, everyone. Coffee’s poured. Before anyone gets comfortable — count the chairs.","Morning. Some of you look rested. Some of you look guilty. Did everyone make it through the night? Look around.","Dawn is served — for most of you, perhaps. Look around the table."],r):vr(["Good morning. I hope you all slept well. Look around the table. Every chair is full… but is everyone alive? If you were poisoned in the night — stand up, and tell us.","Good morning, everyone. Coffee’s poured. Before anyone gets comfortable: if the Forsworn came for you in the night, stand up now.","Morning. Some of you look rested. Some of you look guilty. If you were poisoned last night — on your feet, please.","Dawn is served — for most of you. If you were poisoned in the night, this is your moment. Stand up."],r),
  morningMurder:(n,r)=>killOf()==="murder"?vr([n+". Murdered in the night — their candle went out while every one of you sat blindfolded and heard nothing."+(ghostsOn()?" They’ll watch the rest of this from beyond the table.":" They won’t be back.")+" Someone here did this.",n+". Gone. Taken from this table in the dark, and not one of you noticed. Look at the empty chair — then look at each other.",n+". The Forsworn came for them in the night. Somewhere at this table sits the person who chose them.",n+". Murdered. One of the faces around you knows exactly how it happened."],r)
    :vr([n+". Poisoned at this very table, while you all sat here. You have thirty seconds for your last words — then your candle goes out, and you "+(ghostsOn()?"join the Ghosts":"leave the table")+". Everyone else: someone here handed them the cup.",n+". The Forsworn chose you — while everyone at this table sat blindfolded and did nothing. Thirty seconds, "+n+". Make them count.",n+". Gone in the night. Thirty seconds for your last words — and then "+(ghostsOn()?"you’ll watch the rest of this from beyond the table.":"you leave us."),n+". Poisoned. Look at the faces around you — one of them did this. You have thirty seconds. Use them however you like."],r),
  // a big table’s night can take several: n is "A, B and C"; saved when one more was chosen and a shield held
  morningMany:(n,r,saved)=>(killOf()==="murder"?vr([n+". Murdered in the night, every one of them — their candles went out while you all sat blindfolded and heard nothing. Someone here did this.",n+". Gone. Taken from this table in the dark, and not one of you noticed. Look at the empty chairs — then look at each other."],r):vr([n+". Poisoned at this very table, while you all sat here. Each of you has thirty seconds for your last words — then your candles go out.",n+". The Forsworn chose you, one after another, while this table sat blindfolded and did nothing. Thirty seconds each. Make them count."],r))+(saved?" And one more was chosen last night — and saved by Sanctuary.":""),
  morningShield:r=>vr([killOf()==="murder"?"Every chair is still full. Nobody was murdered. The Forsworn chose someone last night — I walked round this table myself — and found Sanctuary.":"Nobody. Nobody was poisoned. The Forsworn poured the cup last night — I walked it round this table myself — and it met Sanctuary. Somebody here was chosen, and may not even know it. The Forsworn do.",killOf()==="murder"?"Every candle still burns. The Forsworn struck last night — and hit Sanctuary. Someone at this table was their target. They know who. Do you?":"Nobody stands. The Forsworn struck last night — and hit Sanctuary. Someone at this table was their target. They know who. Do you?"],r),
  morningQuiet:r=>vr(["Nobody. Nobody was poisoned last night. Which is either very lucky… or very suspicious.",(killOf()==="murder"?"Every chair is still full, and every candle still burns.":"Nobody stands. Every chair is still full.")+" The Forsworn were quiet last night — and quiet Forsworn are the ones to worry about.","Nobody. Every candle still burns. Enjoy the morning. Watch who’s enjoying it most."],r),
  ghostIntro:n=>"A word about the dead. In this house, a candle that goes out still smokes. "+n+", you are the first Ghost. The exiled and the poisoned stay at the party: they watch everything, and those who died Loyal will be asked to judge. They can perform in Trials when I call on them. But they cannot vote, cannot whisper, and cannot warn you. And when the living put their blindfolds on, so do the Ghosts — every time, no peeking. A Ghost who tries to steer the living will answer to me.",
  ghosts:"Ghosts who died Loyal — you can’t vote, you can’t speak at the table, and when the blindfolds go on, yours do too. But you can judge. When I hand you my phone, name the one you’re sure is a Forsworn. Once. It locks. At the end, we’ll see which of the dead saw clearest — and if the living get greedy, the prize may fall to you.",
  ghostsAgain:"Ghosts who haven’t judged yet — my phone is here whenever you’re ready.",
  take:"But there is one more question. Forsworn, you’ve kept the same false oath all night. Now: would you betray each other? My phone, in secret. HONOUR, or BETRAY.",
  allSealsTurned:"Every seal is turned and every oath laid bare. Now you know what you were sitting beside.",
  endCloaks:n=>"The game is over. And I’m sorry to tell you — "+(n>1?"Forsworn sat":"a Forsworn sat")+" with you to the very end, and nobody saw through them.",
  endCandle:"The game is over. Every false oath has been exposed, every Forsworn exiled. The Loyal have won.",
  // the prize is never named before this line: not on the TV, not in any other script
  prize:(prize,to)=>"And now, the prize. All night you have played for it without knowing what it was. It is… "+prize+". And it goes to "+to+".",
  prizeRps:(prize,names)=>"And now, the prize. All night you have played for it without knowing what it was. It is… "+prize+". There is only one of it. So "+names+": rock, paper, scissors for it. Last one standing takes it home.",
  prizeHome:(name,prize)=>name+" takes home "+prize+". Congratulations. Look after it."
};
// every SAY line reads for the game’s kill style (murder or poison); plain strings become getters so they follow the game
for(const k of Object.keys(SAY)){const d=Object.getOwnPropertyDescriptor(SAY,k);if(d.get){const g=d.get;Object.defineProperty(SAY,k,{get:()=>kw(g.call(SAY)),enumerable:true})}else if(typeof d.value==="function"){const f=d.value;SAY[k]=(...a)=>kw(f(...a))}else{const v=d.value;Object.defineProperty(SAY,k,{get:()=>kw(v),enumerable:true})}}
// Lines that answer the moment: how the vote went, and what the table just found out. One variant per round, so a
// re-render never changes what the host is reading. The Cloak lines never hint whether it was the last one.
const BANTER={
  unanimous:["Unanimous. Not one of you hesitated. I hope, for your sakes, you’re right.","Every board, the same name. That is either clarity… or a very well-run campaign."],
  close:["One vote. A single board stood between staying and going.","That was close. One piece of chalk just decided a fate."],
  tie:["The boards couldn’t decide. So the table did.","Split down the middle — and still, someone has to go."],
  clear:["No hesitation in those boards.","No great mystery there."],
  cloakFirst:["At last. The first Forsworn falls. Is it the last? Only you can decide.","A Forsworn. The Loyal have drawn blood."],
  cloak:["Another Forsworn unmasked. But is that the last of them?","And another. How many are left? Only the Forsworn know."],
  candle:["A Loyal player. Innocent, and gone. Look at who pushed hardest for that.","Loyal. The Forsworn didn’t have to lift a finger tonight."],
  streak:n=>cap1(numWord(n))+" Loyal exiled in a row. Somewhere at this table, a Forsworn is enjoying this enormously."
};
function banter(s,kind){
  const r=s.round||1,pick=a=>a[r%a.length];
  if(kind==="margin"){const m=s.table&&s.table.margin;return m&&BANTER[m]?pick(BANTER[m]):""}
  const log=s.voteLog||[],last=log[log.length-1];if(!last)return"";
  if(last.role==="cloak")return pick(log.filter(x=>x.role==="cloak").length===1?BANTER.cloakFirst:BANTER.cloak);
  let n=0;for(let i=log.length-1;i>=0&&log[i].role!=="cloak";i--)n++;
  return n>=2?BANTER.streak(n):pick(BANTER.candle);
}
