/* ===== scripts: night generator, ceremonies and host lines ===== */
function nightScript(n,st){
  st=st||state;const H=()=>hostOf(st);
  const mode=n.mode,t=n.targetName||"…",tapGeneric={who:"Everyone",tv:"If you feel a tap on the shoulder, remove your blindfold and read the screen. Not a sound.",say:"I am walking the table. If you feel my hand on your shoulder, remove your blindfold and read the screen. Say nothing. Everyone else, stay exactly as you are."};
  const vName=id=>{const p=id&&P2(st,id);return p?p.name:"…"};
  // a shielded victim is never tapped, so nobody may see their name on the screen
  const murderedScreen=(id)=>{const p=id&&P2(st,id);return (n.shielded||(p&&p.shield))?{who:"Everyone",silent:true,murdered:true,tv:"Blindfolds stay on. Not a sound.",say:"Silent. They hold a shield, so you tapped nobody. Wait ten seconds so the room hears nothing, then next line."}:killOf(st)==="murder"?{who:vName(id),silent:true,murdered:true,tv:vName(id)+". You have been murdered. Not a sound. Stand up, and leave the table now."+(ghostsOn(st)?" Wait with the Ghosts, away from the table: you’ll watch the rest from there.":" Your game is over — thank you for playing. Not a word to anyone still at the table."),say:"Silent. They read it, stand and leave the table. Keep your footsteps and your pace the same."}
    :{who:vName(id),silent:true,murdered:true,tv:vName(id)+". You have been poisoned. Say nothing. Blindfold back on. At breakfast, when "+H()+" asks, you will announce it, say your last words — and "+(ghostsOn(st)?"join the Ghosts.":"leave the table."),say:"Silent. They read it and put the blindfold back on."}};
  const gh=ghostsOf(st).length>0;
  const R=st.round||1,G=gh?" — everyone, the Ghosts too":"";
  const s=[{who:"Everyone",tv:gh?"Blindfolds on — Ghosts too. Hands on the table. Not a sound.":"Blindfolds on. Hands on the table. Not a sound.",say:vr(["Night has fallen on the house. Blindfolds on"+G+". Hands flat on the table. If I hear a single word, you will answer for it at breakfast.","The candles are low and the house is quiet. Blindfolds on"+G+". Hands on the table. Not a sound from anyone.","Another night. Somewhere at this table, someone has been waiting all day for this. Blindfolds on"+G+". Hands flat. Silence.","The house is asleep — or pretending to be. Blindfolds on"+G+". Hands on the table. Whatever you hear, you heard nothing."],R)}];
  s.push({who:"Traitors",tv:"Remove your blindfolds. Read the screen. Do exactly as it says.",say:"Traitors, remove your blindfolds. Read the screen, and do exactly what it says. Not a word."});
  // the side-quest comes after they point, so the Faithful it names is never tonight's victim or target
  const questLine=n.quest?[{who:"Traitors",silent:true,quest:true,tv:(n.questTarget?"For "+n.questTarget+", during the next break: ":"Side-quest, during the next break: ")+n.quest+" Done, and it counts for you at the end. Failed, and the pot loses "+moneyOf(st,50)+".",say:"Silent. Their side-quest for the next break. Give them a moment to read it twice."}]:[];
  const pubSh=aliveOf(st).filter(p=>p.shield==="public").map(p=>p.name),shNote=pubSh.length?" Remember: "+andList(pubSh)+(pubSh.length>1?" hold shields":" holds a shield")+" — they cannot be poisoned tonight.":"";
  if(mode==="murder"){
    s.push({who:"Traitors",silent:true,pick:true,tv:"Tonight: a poisoning. Agree in silence, then point at your victim. Hold it until "+H()+" nods."+shNote,say:"Silent. They read the TV. Pick the victim below as they point."},
      ...questLine,
      {who:"Traitors",pick:true,tv:"Blindfolds on.",say:"Traitors, blindfolds back on."},
      {...tapGeneric,tap:"victim"},
      murderedScreen(n.victimId),{who:"Everyone",silent:true,tv:"Blindfolds stay on. Not a sound.",say:killOf(st)==="murder"?"Silent. Wait until they are well clear of the table — about fifteen seconds, the same whether or not anyone left.":"Silent. Give it five seconds so nobody can tell whether anyone was tapped."});
  }else{
    s.push({who:"Traitors",silent:true,pick:true,tv:mode==="recruit"?"Tonight: no poison. Recruit. Agree on one Faithful to bring to your side, then point at them. Hold it until "+H()+" nods.":"Tonight: an ultimatum. Choose one Faithful. They join you, or they die. Point at them. Hold it until "+H()+" nods."+(shNote?shNote.replace("they cannot be poisoned tonight","a shield still saves them if they refuse"):""),say:"Silent. They read the TV. Pick the target below as they point."},
      ...questLine,
      {who:"Traitors",pick:true,tv:"Blindfolds on.",say:"Traitors, blindfolds back on."},
      {...tapGeneric,tap:"target"},
      {who:t,silent:true,answer:true,tv:mode==="recruit"?t+". The Traitors have chosen you. Accept, and from tonight you are one of them — the prize is yours only if a Traitor survives. Refuse, and you stay Faithful — but they will know your face, and you will know nothing. Nod to accept. Shake your head to refuse.":t+". This is not an invitation. Join the Traitors, or be poisoned tonight. Nod to join. Shake your head to die as a Faithful.",say:"Silent. They read the TV and nod or shake. Record their answer below."});
    if(n.answer==="yes"){
      s.push({who:t,silent:true,tv:t+" — welcome, Traitor. Keep your blindfold off. Wait in silence.",say:"Silent. Now tap each Traitor on the shoulder at the next line."},
        {who:"Traitors",silent:true,tap:"traitors",tv:"If you feel a tap on the shoulder, remove your blindfold and read the screen. Not a sound.",say:"Silent — say nothing this time. Walk the table and tap each Traitor; they read the screen."},
        {who:"Traitors",silent:true,tv:"Traitors, meet your newest ally: "+t+". Look at each other. Remember. Then all of you, blindfolds on together.",say:"Silent. Let them look. When all blindfolds are back on, go to the next line."});
    }else if(n.answer==="no"){
      s.push({who:t,silent:true,tv:"Your answer is sealed. Blindfold on.",say:"Silent."+(mode==="ultimatum"?" They refused: the next line is the murder tap.":"")});
      if(mode==="ultimatum")s.push({...tapGeneric,tap:"victim"},murderedScreen(n.targetId));
    }else{
      s.push({who:"…",pending:true,tv:"…",say:"Record the answer to see the rest of the script."});
    }
  }
  const dawn=killOf(st)==="murder"?["Everyone, remove your blindfolds. Dawn is coming. Say nothing yet — breakfast will tell us who made it through the night.","Blindfolds off, everyone. The night is over. Not a word until breakfast.","Everyone, blindfolds off. Morning is on its way, and with it, the truth. Some of it.","Blindfolds off. First light over the house. Nobody say a word about what they did or didn't hear."]:["Everyone, remove your blindfolds. Dawn is coming. Everyone is still here. For now.","Blindfolds off, everyone. The night is over. Look around — every chair still full. For now.","Everyone, blindfolds off. Morning is on its way, and with it, the truth. Some of it.","Blindfolds off. First light over the house. Nobody say a word about what they did or didn't hear."];
  s.push({who:"Everyone",tv:vr(["Remove your blindfolds. Dawn is coming.","Blindfolds off. The night is over.","Remove your blindfolds. Morning is on its way.","Blindfolds off. First light."],R),say:vr(dawn,R)});
  return kwLines(s,st);
}
const norm=e=>Array.isArray(e)?{who:e[0],tv:e[1],say:e[2]}:e;
// A key line has a few phrasings; each round takes the next, so no two rounds running sound the same and a line never
// changes while the host is reading it.
const vr=(a,r)=>a[((r||1)-1)%a.length];
const NIGHT0_=h=>[
["Everyone","Blindfolds on. Hands on the table.","Now. Blindfolds on, everyone. Hands flat on the table. From this moment, nothing you see can be trusted."],
[h,"I am choosing the Traitors. If you feel a tap on the shoulder, you take the cloak.","I am walking the table now. If you feel my hand on your shoulder, you take the cloak: you are a Traitor. Say nothing. Show nothing. Your friends are about to become your prey."],
["Traitors","Remove your blindfolds. Look around. Remember what you see.","Traitors — and only Traitors — remove your blindfolds. Look up. Look around. Remember what you see. Tomorrow you'll have to pretend you know nothing at all."],
["Traitors","Blindfolds on.","Traitors, blindfolds back on. Silently."],
["Everyone","Remove your blindfolds. The game has begun.","Everyone, remove your blindfolds. Look at each other. Somebody at this table is already wearing the cloak. The game has begun."]];
const BF=g=>g?"Blindfolds on — Ghosts too.":"Blindfolds on.";
// The special prize, straight after the mission: whoever won it meets the Traitor now. Nothing said aloud names it, and
// when a Traitor won it the room hears exactly the same lines — the host taps them, then walks the table tapping nobody.
const SEERNOW_=(h,g,c)=>{
  const f=!!c.fake,G=g?", Ghosts too":"";
  return [
    {who:"Everyone",tv:BF(g),say:"The mission is over. Blindfolds on, everyone"+G+". Hands on the table. Not a sound."},
    {who:h,tap:"seer",tv:"If you feel a tap on the shoulder, remove your blindfold and read the screen. Not a sound.",say:"I am walking the table. If you feel my hand on your shoulder, remove your blindfold and read the screen. Say nothing."},
    {who:"Winner",silent:true,tv:f?"You won the special prize: the Seer. But you are the Traitor — there is nobody for you to meet. Stay perfectly still. Give nothing away.":"You won the special prize: you are the Seer. In a moment one more person will take off their blindfold. Look at them.",say:"Silent. Let them read it twice."},
    {who:h,silent:true,tap:"traitor",tv:"If you feel a tap on the shoulder, remove your blindfold and look up. Not a sound.",say:f?"Silent. Walk the table as if you were tapping someone — tap nobody.":"Silent. Tap the Traitor on the shoulder."},
    {who:"Both",silent:true,tv:f?"Stay still. Thirty seconds. Not a sound.":"Seer: the other person with their blindfold off is a Traitor. Traitor: this person is the Seer — they know your face now, and you cannot poison them. Thirty seconds. Not a sound.",say:"Silent. Give them thirty seconds."},
    {who:"Both",silent:true,tv:f?"Blindfold back on.":"Blindfolds on. Both of you.",say:"Silent. When the blindfolds are back on, next line."},
    {who:"Everyone",tv:"Remove your blindfolds.",say:"Blindfolds off, everyone. The special prize has been claimed. Somebody at this table knows more than they did a minute ago."}].map(l=>({...l,tv:kw(l.tv),say:kw(l.say)}));
};
const CEREMONY_=(h,g,c)=>{
  const n=c.secCount||0,war=!!c.secWar,dag=!!c.secDag,G=g?", Ghosts too":"";
  const what=[war?"the Warrior":null,n?(n>1?numWord(n)+" shields":"a shield"):null,dag?"the dagger":null].filter(Boolean),many=what.length>1||n>1;
  const L=[{who:"Everyone",tv:BF(g),say:"The mission is over — and somewhere in it, "+andList(what)+(many?" were":" was")+" won in secret. Blindfolds on, everyone"+G+". Hands on the table."}];
  if(war)L.push({who:h,tap:"warrior",tv:"The Warrior has been chosen — shield and dagger. Whoever feels a tap now is the Warrior.",say:"Whoever feels my hand on their shoulder now is the Warrior. You hold a shield: the Traitors cannot poison you tonight. And the dagger: at the Reckoning your vote counts twice — when the last board is in, the table sees where it fell, never whose it was. Only you may lay both down at the table, before the first board, to be safe from the banishment. Whether anyone else ever knows… is up to you."});
  if(n)L.push({who:h,tap:"shield",tv:(n>1?"Shields have":"A shield has")+" been won. Whoever feels a tap now holds a shield.",say:"Whoever feels my hand on their shoulder now holds a shield tonight. The Traitors cannot poison you. Whether you tell the table… is up to you."});
  if(dag)L.push({who:h,tap:"dagger",tv:"The dagger has been won. Whoever feels a tap now holds it.",say:"Whoever feels my hand on their shoulder now holds the dagger. At tonight's Reckoning your vote counts twice. When the last board is in, the table sees where the dagger fell — never whose it was."});
  L.push({who:"Everyone",tv:"Remove your blindfolds. "+cap1(andList(what))+(many?" have":" has")+" been claimed.",say:"Blindfolds off. "+cap1(andList(what))+(many?" have":" has")+" been claimed. Look around the table. Somebody here knows something you don't."});
  return L.map(l=>({...l,tv:kw(l.tv),say:kw(l.say)}));
};
const SHIELD0_=(h,g,n)=>n>1?[
["Everyone",BF(g),"The mission is over — and somewhere in it, "+numWord(n)+" shields were won. Blindfolds on, everyone"+(g?", Ghosts too":"")+". Hands on the table."],
[h,"Shields have been won. Whoever holds one will feel a tap on the shoulder.","Whoever feels my hand on their shoulder holds a shield tonight. The Traitors cannot poison you. Whether you tell the table… is up to you."],
["Everyone","Remove your blindfolds. The shields have been claimed.","Blindfolds off. Some of you are safe tonight. The rest of you are not."]]:[
["Everyone",BF(g),"The mission is over — and somewhere in it, a shield was won in secret. Blindfolds on, everyone"+(g?", Ghosts too":"")+". Hands on the table."],
[h,"A shield has been won. Whoever holds it will feel a tap on the shoulder.","Whoever feels my hand on their shoulder holds a shield tonight. The Traitors cannot poison you. Whether you tell the table… is up to you."],
["Everyone","Remove your blindfolds. The shield has been claimed.","Blindfolds off. Somebody here is safe tonight. Somebody else is not."]];

const SAY={
  lobbyWait:"Take your seats, everyone, and fill your glasses. When the titles roll on the screen, the game begins.",
  lobby:"Welcome to Cloak & Candle. Look at the screen: there is a candle burning for every one of you. Tonight, around this table, sit the Faithful — and the Traitors, hidden under the cloak. Each night the Traitors will poison one of you, and a candle will go out. Each day the Faithful must find them and banish them. Trust no one. Not the person who poured your wine. Not the person who drove you here.",
  day:r=>r>1?vr(["Round "+numWord(r)+". The table is smaller, and the pot is still hungry. Before you can point fingers, you must earn the right. Today's mission…","Round "+numWord(r)+". Fewer chairs, longer memories. The pot won't fill itself — and a Traitor would quite like it to stay empty. Today's mission…","Round "+numWord(r)+". You know each other a little better now. That should worry you. First, the pot. Today's mission…"],r-1):"Good morning, and welcome to round one. Before you can point fingers, you must earn the right. The pot only grows if you work together — which is a strange thing to ask of a table with Traitors on it. Today's mission…",
  final:"This is the final round. A last mission, then the Reckoning — and after that, you decide whether it's over. If a Traitor is still sitting here when it ends, the Faithful get nothing.",
  missionDone:r=>vr(["The mission is over. Look at the scores — and remember, a Faithful who plays badly looks a lot like a Traitor who's sabotaging.","That's the mission. Some of you tried very hard. Some of you tried very hard to look like you were trying.","Mission over. The pot remembers who helped it — and so should you."],r),
  afterCeremony:"Remember who played badly tonight. A Faithful who plays badly looks a lot like a Traitor who's sabotaging.",
  shieldPublic:n=>n+" holds the shield tonight. The Traitors cannot touch them. Which, I suppose, means they can say whatever they like at the Reckoning.",
  // the Warrior is explained when it is given, and reminded at the table
  warriorFull:n=>n+", you are tonight's Warrior. You hold a shield — the Traitors cannot poison you tonight — and the dagger: at the Reckoning, your vote counts twice. One more thing. At the table, before the first board turns, you may lay both down. Then nobody may chalk your name — but your vote counts once, and tonight nothing protects you. Think about when you'll need it.",
  dagger:n=>n+", you hold the dagger. At tonight's Reckoning, your vote counts twice. Use it well — everyone will be watching whose name you chalk.",
  talkWarriorSecret:" And if any of you is the Warrior, won in secret: before the first board turns, you may lay down your shield and your dagger, and nobody may chalk your name at this table. Say it now, or not at all. Keep them, and the dagger adds one more vote to your choice when the last board is in.",
  talkDaggerSecret:" And somebody here holds the dagger, won in secret. It counts twice — and when the last board is in, you will all see where it fell.",
  talkDagger:n=>" And "+n+", the dagger: your board counts once as it turns, like everyone's. When the last board is in, it adds one more vote to your choice.",
  potSplit:(total,names,each)=>names.length>1?"And the pot — "+total+" — is split between "+andList(names)+": "+each+" each.":names[0]+" takes the pot too: "+total+".",
  talkWarrior:n=>" And "+n+": you are the Warrior. Before the first board turns, you may lay down your shield and your dagger — and nobody may chalk your name at this table. The choice is yours. Say it now, or not at all.",
  warriorLaid:(n,r)=>vr([n+" lays down shield and dagger. Nobody may chalk that name at this table. But tonight, in the dark, nothing protects them — and their vote counts once.",n+" gives up the shield and the dagger. Safe from this table — and from nothing else. Tonight they sleep like the rest of you."],r),
  revote:n=>"A tie. So we go again — and this time the only names you may chalk are "+n+". Boards to your chest. Same as before: when I say your name, turn it.",

  stillTied:n=>"Still tied. Then it falls to everyone else: all of you except "+n+", agree one name out loud. Sixty seconds. If you can't, I decide.",
  shieldShown:a=>andList(a)+(a.length>1?" have shown their shields.":" has shown their shield.")+" Nobody may chalk "+(a.length>1?"those names":"that name")+" at this table. But a shield shown is a shield spent — tonight, in the dark, nothing protects "+(a.length>1?"them":"them")+".",
  talk:r=>vr(["Before the chalk comes out, you talk. Free for all. Accuse, defend, deflect. When the ring runs out, the talking stops and the chalk comes out — and nobody gets to change their mind after that.","The Reckoning is open. Say what you've been thinking all day. When the ring runs out, the talking stops, and the chalk does the rest.","Take your seats. You've watched each other all day — now's the time to say it out loud. Accuse, defend, deflect. When the ring is empty, chalk.","Somebody at this table has been lying to you all day. Now's your chance. Talk. When the ring runs out, not another word — just chalk."],r),
  dilemma:(st,st2)=>"One more decision before the table. Chalk one word: POT or SHIELD. If exactly one of you writes SHIELD, they hold it tonight and the pot grows by "+st+". If nobody dares, the pot grows by "+st2+". If two or more of you grab for it — nobody gets it, and the pot loses "+st+". Boards face down.",
  final2:"Two of you left. Nothing more to say, nothing more to chalk. Whatever you are, we are about to find out.",
  ceremony:n=>cap1(numWord(n))+" of you, still at the table. Nothing more to say, nothing more to chalk. One at a time, you will find out what you have been sitting beside.",
  ceremonyReveal:"Say the name of the seal you're about to turn, then: for the last time tonight — Faithful… or Traitor?",
  countdown:n=>cap1(numWord(n))+" rounds of letters. Longest real word wins the round.",
  quiz:per=>"Three parts, "+numWord(per)+" questions each: easy, then medium, then brutal. First to shout is locked in — right or wrong.",
  get final2Traitors(){return "You have kept each other's secret all night. So there is one question left, and it is not about the Faithful. Share the prize, or steal it. My phone, in secret, one at a time. All share: you split the pot, and play rock, paper, scissors for the prize. One steals: they take it all. Two or more steal… and "+(ghostsOn()?"it goes to the dead — to any Ghost who named one of you.":"nobody gets anything at all.")},
  ghostSteal:n=>"The Traitors robbed each other — so the prize passes to the dead. "+n+": you each named a Traitor from beyond the table. Now the same question falls to you. My phone, in secret. Share, or steal?",
  endvote:"This is the end of the road — unless you say otherwise. My phone is coming round the table. END, if you believe every Traitor is gone and you are ready to share the prize. BANISH, if you think one still sits among you. It must be unanimous to end. Your vote stays secret until the TV turns the cards — then everyone sees who voted what.",
  endvoteBanish:n=>cap1(numWord(n))+" of you want another banishment. So be it. Back to the Reckoning — and make it count.",
  secondMission:r=>vr(["Not so fast. Nobody sits down yet. One mission earns the right to point fingers; two earns the right to be believed. Back to your chalkboards — the pot grows, and so does the list of people who played badly.","Another one. The pot is not full, and I am not finished with you. Chalkboards.","Stay standing — well, stay seated, but stay sharp. One more mission before the table."],r),
  dinner:m=>"Dinner. "+cap1(numWord(m))+" minutes. Sit where you like — and notice who chooses to sit next to you. A Traitor never eats alone if they can help it.",
  mingle:(m,r)=>vr(["Up you get. "+cap1(numWord(m))+" minutes. Refill a glass, corner someone, tell a lie. Everything you say in the next "+numWord(m)+" minutes can and will be used against you at the table.","Stretch your legs. "+cap1(numWord(m))+" minutes. Find the person you trust least and ask them a question they won't want to answer.","Break. "+cap1(numWord(m))+" minutes. Top up, pair up, whisper. The Traitors certainly will."],r),
  table:r=>vr(["It's time. Chalk the name of the one you suspect, and keep your board to your chest. I'll go round the table: when I say your name, turn it — and tell them why, to their face.","Chalk in hand. One name — the one you believe is a Traitor. Boards to your chest. When I say your name, turn it, and tell them why.","The talking is done. Write one name. Keep it hidden. I'll come round the table: turn your board when I say your name, and look them in the eye while you explain.","One name each. Chalk it, hide it. When I call you, turn it — and say why, to their face. No speeches. Just the truth as you see it."],r),
  revealFinal:(n,r)=>vr([n+", the table has spoken. In the final there are no confessions. Stand up, say nothing, and leave the table. We find out what you were when it is over.",n+", that's the table's decision. No confession now — not in the final. Stand, and go without a word. The rest of us will find out at the very end."],r),
  reveal:(n,r)=>vr([n+", the table has spoken. Stand up. Before you go — tell us, honestly, for the first time tonight: are you a Faithful… or a Traitor?",n+", you've been banished. Stand up. No more games — tell the table what you really are. Faithful… or Traitor?",n+". The house has decided. Please stand. For once tonight, there's no point lying: were you Faithful… or a Traitor?",n+", your candle is going out. On your feet. Tell them — and look at the people who chalked your name while you do. Faithful, or Traitor?"],r),
  breakfastAsk:r=>killOf()==="murder"?vr(["Good morning. I hope you all slept well. Look around the table. Is every chair still full?","Good morning, everyone. Coffee's poured. Before anyone gets comfortable — count the chairs.","Morning. Some of you look rested. Some of you look guilty. Did everyone make it through the night? Look around.","Breakfast is served — for most of you, perhaps. Look around the table."],r):vr(["Good morning. I hope you all slept well. Look around the table. Every chair is full… but is everyone alive? If you were poisoned in the night — stand up, and tell us.","Good morning, everyone. Coffee's poured. Before anyone gets comfortable: if the Traitors came for you in the night, stand up now.","Morning. Some of you look rested. Some of you look guilty. If you were poisoned last night — on your feet, please.","Breakfast is served — for most of you. If you were poisoned in the night, this is your moment. Stand up."],r),
  morningMurder:(n,r)=>killOf()==="murder"?vr([n+". Murdered in the night — their candle went out while every one of you sat blindfolded and heard nothing."+(ghostsOn()?" They'll watch the rest of this from beyond the table.":" They won't be back.")+" Someone here did this.",n+". Gone. Taken from this table in the dark, and not one of you noticed. Look at the empty chair — then look at each other.",n+". The Traitors came for them in the night. Somewhere at this table sits the person who chose them.",n+". Murdered. One of the faces around you knows exactly how it happened."],r)
    :vr([n+". Poisoned at this very table, while you all sat here. You have thirty seconds for your last words — then your candle goes out, and you "+(ghostsOn()?"join the Ghosts":"leave the table")+". Everyone else: someone here handed them the cup.",n+". The Traitors chose you — while everyone at this table sat blindfolded and did nothing. Thirty seconds, "+n+". Make them count.",n+". Gone in the night. Thirty seconds for your last words — and then "+(ghostsOn()?"you'll watch the rest of this from beyond the table.":"you leave us."),n+". Poisoned. Look at the faces around you — one of them did this. You have thirty seconds. Use them however you like."],r),
  morningShield:r=>vr([killOf()==="murder"?"Every chair is still full. Nobody was murdered. The Traitors chose someone last night — I walked round this table myself — and found a shield.":"Nobody. Nobody was poisoned. The Traitors poured the cup last night — I walked it round this table myself — and it met a shield. Somebody here was chosen, and may not even know it. The Traitors do.",killOf()==="murder"?"Every candle still burns. The Traitors struck last night — and hit a shield. Someone at this table was their target. They know who. Do you?":"Nobody stands. The Traitors struck last night — and hit a shield. Someone at this table was their target. They know who. Do you?"],r),
  morningQuiet:r=>vr(["Nobody. Nobody was poisoned last night. Which is either very lucky… or very suspicious.",(killOf()==="murder"?"Every chair is still full, and every candle still burns.":"Nobody stands. Every chair is still full.")+" The Traitors were quiet last night — and quiet Traitors are the ones to worry about.","Nobody. Every candle still burns. Enjoy your breakfast. Watch who's enjoying it most."],r),
  ghostIntro:n=>"A word about the dead. In this house, a candle that goes out still smokes. "+n+", you are the first Ghost. The banished and the poisoned stay at the party: they watch everything, and those who died Faithful will be asked to judge. They can perform in missions when I call on them. But they cannot vote, cannot whisper, and cannot warn you. And when the living put their blindfolds on, so do the Ghosts — every time, no peeking. A Ghost who tries to steer the living will answer to me.",
  ghosts:"Ghosts who died Faithful — you can't vote, you can't speak at the table, and when the blindfolds go on, yours do too. But you can judge. When I hand you my phone, name the one you're sure is a Traitor. Once. It locks. At the end, we'll see which of the dead saw clearest — and if the living get greedy, the prize may fall to you.",
  ghostsAgain:"Ghosts who haven't judged yet — my phone is here whenever you're ready.",
  steal:"But there is one more question. Traitors, you've hidden under the same cloak all night. Now: would you betray each other? My phone, in secret. SHARE, or STEAL.",
  allSealsTurned:"Every seal is turned and every cloak is off. Now you know what you were sitting beside.",
  endTraitors:n=>"The game is over. And I'm sorry to tell you — "+(n>1?"Traitors sat":"a Traitor sat")+" with you to the very end, and nobody pulled the cloak away.",
  endFaithful:"The game is over. Every cloak has been pulled away, every Traitor banished. The Faithful have won.",
  // the prize is never named before this line: not on the TV, not in any other script
  prize:(prize,to)=>"And now, the prize. All night you have played for it without knowing what it was. It is… "+prize+". And it goes to "+to+".",
  prizeRps:(prize,names)=>"And now, the prize. All night you have played for it without knowing what it was. It is… "+prize+". There is only one of it. So "+names+": rock, paper, scissors for it. Last one standing takes it home.",
  prizeHome:(name,prize)=>name+" takes home "+prize+". Congratulations. Look after it."
};
// every SAY line reads for the game's kill style (murder or poison); plain strings become getters so they follow the game
for(const k of Object.keys(SAY)){const d=Object.getOwnPropertyDescriptor(SAY,k);if(d.get){const g=d.get;Object.defineProperty(SAY,k,{get:()=>kw(g.call(SAY)),enumerable:true})}else if(typeof d.value==="function"){const f=d.value;SAY[k]=(...a)=>kw(f(...a))}else{const v=d.value;Object.defineProperty(SAY,k,{get:()=>kw(v),enumerable:true})}}
// Lines that answer the moment: how the vote went, and what the table just found out. One variant per round, so a
// re-render never changes what the host is reading. The Traitor lines never hint whether it was the last one.
const BANTER={
  unanimous:["Unanimous. Not one of you hesitated. I hope, for your sakes, you're right.","Every board, the same name. That is either clarity… or a very well-run campaign."],
  close:["One vote. A single board stood between staying and going.","That was close. One piece of chalk just decided a fate."],
  tie:["The boards couldn't decide. So the table did.","Split down the middle — and still, someone has to go."],
  clear:["No hesitation in those boards.","No great mystery there."],
  traitorFirst:["At last. The first Traitor falls. Is it the last? Only you can decide.","A Traitor. The Faithful have drawn blood."],
  traitor:["Another Traitor unmasked. But is that the last of them?","And another. How many are left? Only the Traitors know."],
  faithful:["A Faithful. Innocent, and gone. Look at who pushed hardest for that.","Faithful. The Traitors didn't have to lift a finger tonight."],
  streak:n=>cap1(numWord(n))+" Faithful banished in a row. Somewhere at this table, a Traitor is enjoying this enormously."
};
function banter(s,kind){
  const r=s.round||1,pick=a=>a[r%a.length];
  if(kind==="margin"){const m=s.table&&s.table.margin;return m&&BANTER[m]?pick(BANTER[m]):""}
  const log=s.voteLog||[],last=log[log.length-1];if(!last)return"";
  if(last.role==="traitor")return pick(log.filter(x=>x.role==="traitor").length===1?BANTER.traitorFirst:BANTER.traitor);
  let n=0;for(let i=log.length-1;i>=0&&log[i].role!=="traitor";i--)n++;
  return n>=2?BANTER.streak(n):pick(BANTER.faithful);
}
