// Talking Pieces cast: names, voices and the line library, plus the moments a move gives the pieces. Shared by the
// Talking Pieces page (browser global `ChessCast`) and the table runner's games (Node, through chess-cli.mjs). Seam, 2026-11-09.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./chess-core.js'));
  else root.ChessCast = factory(root.ChessCore);
})(typeof self !== 'undefined' ? self : this, function (core) {
'use strict';
// ================= cast =================
const BLURB={laconic:'Says little. Means it.',braggart:'Has never once been wrong (self-reported).',pompous:'Speaks for the clergy. Unasked.',
  cryptic:'Knows things. Shares fewer.',pragmatic:'No flair. Few mistakes.',sarcastic:'Does everything. Mentions it.',anxious:'Would prefer not to.',
  chorus:'Small. Brave. Loud.',menacing:'Wants your king. Says so.',sly:'Smiles on the diagonal.',feral:'Bites first.',grunts:'Mud, march, repeat.'};
const WBACK=[['Brick','laconic',.7],['Sir Bounce','braggart',.2],['Father Flint','pompous',.45],['Margo','sarcastic',.9],['Aldric','anxious',.6],['Sister Vex','cryptic',.75],['Dapple','pragmatic',.8],['Mortar','laconic',.7]];
const WPAWN=[['Kev',.5],['Dot',.35],['Pip',.6],['Mags',.4],['Tubs',.3],['Nell',.55],['Rolo',.45],['Fitz',.5]];
const BBACK=[['Crag','menacing'],['Gnash','feral'],['Brother Ash','sly'],['Lady Nox','menacing'],['Grimsby','menacing'],['Mother Sly','sly'],['Skitter','feral'],['Hollow','menacing']];
const BPAWN=['Grub','Moss','Tick','Scab','Fen','Lump','Wort','Bog'];

// ================= lines =================
// Each voice+key is dealt from a shuffled deck, so a line doesn't come back until the rest of its pool has been used.
const L={
 anxious:{
  first_move:["Must I? Fine. One square.","Moving. Under protest.","I'd like it noted that I moved reluctantly."],
  castle:["Tucked in. Lovely. Nobody look at me.","Behind the wall. Much better. Slightly better."],
  capture:["Did I just do that? Somebody write it down.","Sorry! Sorry. Not sorry. Slightly sorry.","I took something! Is that allowed?"],
  danger:["Why is everyone looking at me?","I'm being looked at. Aggressively."],
  check_recv:["CHECK? Me? Guards! GUARDS!","Nobody panic. Except me. I'll panic.","Why is it always me?","I felt that one in my crown."],
  advise:["If it were up to me (it never is): {move}.","Have you considered {move}? Quietly? Carefully?","{move}. Then we hide. Mostly the hiding part.","Small suggestion, small voice: {move}."],
  advise_sore:["You never listen, but: {move}."],
  told:["Oh. It worked. I'm as surprised as you."],excuse:["In my defense, I was nervous.","I said 'carefully'. That was not carefully."],
  sulk:["No, no, ignore the king. Everyone does."],
  others_sacrifice:["Is that... on purpose? Please say that's on purpose."],
  reply_boast:["Well done, {name}! Please stop shouting."],
  challenge:["Last time we listened to {name} it went badly. I remember. I always remember."],
  retort:["Please don't provoke them."],
  win:["We won? We WON. Can I sit down now?"],lose:["I knew this would happen. I said so. Nobody listened."],
  draw:["A draw! Everybody lives! Best possible result."],
  greet_regular:["Game {n} together. I'm still nervous, if anyone's wondering.","Game {n}. Same board. Same nerves."]},
 sarcastic:{
  first_move:["Finally. Let's get this over with.","Make room. I'm working."],
  capture:["Next.","That was the warm-up.","Tidy.","Was that a piece? It looked like a piece.","Clean up on that square."],
  streak:["{n}. Try to keep up."],
  last:["Fine. Do it without me. See how that goes.","Tell them I was magnificent."],
  danger:["Someone's eyeing me. Bold.","Somebody thinks they can take me. Adorable."],
  danger_again:["Again? You're very consistent about leaving me out."],
  check_give:["Check, darling.","Your king looks tired. Check."],
  advise:["{move}. Obviously.","{move}. Try to keep up.","Since nobody asked: {move}.","{move}. You're welcome in advance."],
  advise_sore:["Oh, NOW you want my opinion? Fine: {move}."],
  told:["You're welcome.","Write that down."],excuse:["That was a test. You failed it beautifully.","Huh. The board lied to me."],
  sulk:["Ignore me. Bold strategy.","Noted. Filed. Remembered."],
  sacrificed:["Ah. I'm the plan. How flattering.","Fine. Make it count."],
  hung:["You've left me out here, haven't you.","Interesting square. Exposed. Like your plan."],
  hung_again:["Again. You're very consistent."],
  others_sacrifice:["Bold. I'd clap, but I'm busy being irreplaceable."],
  reply_boast:["Lovely, {name}. Now fetch me a pawn."],
  challenge:["Don't listen to {name}. Look at the record."],
  retort:["Good. Then you know how this ends.","Cute. Say it again from across the board."],
  win:["Was there ever any doubt? Don't answer that."],
  greet_returned:["Oh. You're deploying me again. How reassuring."],
  greet_sacrificed:["Last game you spent me like pocket change. I remember."],
  greet_hero:["Same as last time? I'll take the winning move again, thanks."]},
 laconic:{
  first_move:["Out."],castle:["Wall up."],
  capture:["Flattened.","Gone.","Hm. Crunch."],streak:["{n}."],last:["...ow.","Fair."],
  danger:["Under fire."],check_give:["Check."],
  advise:["{move}.","{move}. Trust the wall."],advise_sore:["Third time. {move}."],
  told:["Yep."],excuse:["Walls can't see over things."],sulk:["Noted."],
  sacrificed:["Holding. For now."],hung:["Exposed."],
  others_sacrifice:["Excellent sacrifice. Particularly the part where it isn't me."],
  reply_boast:["Show-off."],challenge:["{name}? Really?"],retort:["Noted. Ignored."]},
 pompous:{
  first_move:["The clergy enters the field.","Make way. Diagonally."],
  capture:["Absolved. Permanently.","Let that be a sermon.","Go in peace. Go far away in peace."],
  last:["This is most irregular!","I demand a recount!"],
  danger:["I sense hostility, and I disapprove of it."],check_give:["Check, and repent."],
  advise:["Scripture is clear: {move}.","It is written (by me, just now): {move}.","A vision came to me: {move}. Possibly indigestion."],
  advise_sore:["The faithful never listen. Still: {move}."],
  told:["As foretold."],excuse:["The vision was... allegorical.","Clearly a translation error."],sulk:["Heresy."],
  sacrificed:["I go willingly. Mostly."],hung:["I have been abandoned by the faithful."],
  others_sacrifice:["A martyr! I'll prepare a few words."],
  reply_boast:["Bless you, {name}. Loudly, apparently."],challenge:["{name} speaks, but not for the clergy."],retort:["Silence, heathen."]},
 cryptic:{
  first_move:["The diagonal opens."],
  capture:["It was always going to end this way.","They walked into a line I drew last week.","The angle collects."],
  last:["I saw this coming. I came anyway."],
  danger:["A shadow on my diagonal."],check_give:["Check. You felt that one coming."],
  advise:["{move}. Don't ask why. I won't tell you.","The squares whisper: {move}.","{move}. You'll understand in three moves. Or never."],
  advise_sore:["You won't listen. {move}."],
  told:["Mm."],excuse:["The whisper was for someone else."],sulk:["Another path, then."],
  sacrificed:["I knew I'd stand here."],hung:["Alone on the edge. Again."],
  others_sacrifice:["Some squares are doors. That one was a door."],
  reply_boast:["{name} will remember this. Briefly."],challenge:["{name} sees a different board than the rest of us."],retort:["Speak while you still can."]},
 braggart:{
  first_move:["HUP! The legend gallops forth!","Out of the stable and into history!","L-shaped and fabulous."],
  capture:["SIR BOUNCE STRIKES!","Write a song about this. Several songs.","Did everyone see? Somebody tell me everyone saw."],
  streak:["That's {n}! Start the second song!"],
  last:["Tell my horse... wait. I'm the horse.","A legend falls! Briefly! See you next game!"],
  danger:["Let them come! (Please don't let them come.)"],check_give:["CHECK! Hup hup!"],
  advise:["Bold idea, absolutely foolproof: {move}!","Trust me, I'm a knight. {move}!","{move}! I've never been wrong. Today.","{move}! You'll thank me in the song."],
  advise_sore:["You've ignored a genius twice. Last chance: {move}!"],
  told:["NEVER WRONG!","As I have always said!"],
  excuse:["The plan was perfect. The board was flawed.","That was a feint. A very convincing feint.","History will vindicate me."],
  sulk:["Your loss. Literally, probably."],
  sacrificed:["A GLORIOUS sacrifice! Mine! Remember the name!"],hung:["Out here alone? No problem! (Problem.)"],
  others_sacrifice:["I'd have sacrificed more stylishly."],
  reply_boast:["Not bad, {name}. Not Bounce-level, but not bad."],challenge:["{name}?! Ask ME next time."],
  retort:["Talk is cheap! So am I! But effective!"],
  greet_sacrificed:["Remember my glorious sacrifice? I do. Constantly."],
  greet_hero:["Who delivered mate last game? ME. Who's counting? Also me."]},
 pragmatic:{
  first_move:["Good. Developing.","Fine. Going."],
  capture:["Clean.","That one was loose.","Free material. Taking it."],
  last:["Should've checked for the fork.","Yep. Saw it late."],
  danger:["I'm loose here. Somebody cover me?"],check_give:["Check. Keep the pressure on."],
  advise:["{move}. Not exciting, just correct.","Honest suggestion: {move}.","{move}. It holds up."],
  advise_sore:["You haven't taken one of mine yet, but: {move}."],
  told:["Told you it holds."],excuse:["Missed something. My bad."],sulk:["Your call."],
  sacrificed:["Fine. It's worth it. Probably."],hung:["I'm loose. That's on you."],
  others_sacrifice:["That's a real sacrifice. I checked. Twice."],
  reply_boast:["Good take, {name}. Don't get loose."],challenge:["{name}'s tips haven't held up. Just saying."],
  retort:["Let them talk. We'll play."]},
 chorus:{
  first_move:["Forward! It's the only way we know.","One small step for a pawn.","Are we there yet?","Big day for me personally.","Mum's watching, so no pressure.","I've been practicing this square."],
  capture:["A PAWN did that. A PAWN.","Tell my mum!","I'm putting this on my résumé.","Little guy, big day."],
  streak:["{n} captures! I'm basically a rook now."],
  last:["Remember me as... someone.","Worth it? Worth it.","Tell the others I said bye.","At least I got out of the house."],
  danger:["Uh, help? Little guy in danger here."],check_give:["Is that... check? From me?"],
  advise:["Not sure I'm allowed opinions, but {move}?","My cousin says {move}.","{move}! Probably! I'm a pawn!"],
  advise_sore:["Nobody listens to pawns, but {move}."],
  told:["Wait, it WORKED?"],excuse:["My cousin's been wrong before."],sulk:["Nobody listens to pawns."],
  sacrificed:["I volunteer! Wait, did I volunteer?"],hung:["Uh. Hello? Is anyone covering me?"],
  others_sacrifice:["Whoa. Brave. Glad it's not me, but brave."],
  reply_boast:["{name}! {name}! {name}!"],challenge:["My cousin says don't trust {name}."],
  retort:["Yeah! What they said!"],
  promote:["I'M A {piece} NOW. Everyone has to listen to me."],
  greet_sacrificed:["I'm back! Last game didn't count, right?"]},
 menacing:{
  taunt:["Your king looks lonely.","I've seen pawns play braver.","Take your time. Your position won't wait.","Closer.","Your formation has a draft in it.","Tick tock."],
  capture:["Mine.","Is that all you brought?","Sweep that up.","One less voice on your side."],
  streak:["{n}. I'm only getting started."],
  last:["This changes nothing.","A setback. A loud one."],
  check_give:["Check. Breathe through it.","Check. Run, little king."],
  check_recv:["A scratch.","Bold. Pointless, but bold."],
  gloat:["Oh, you didn't.","I'll send flowers to that piece."],
  tip_bad:["Free tip: {move}. Totally safe. Promise.","If I were you (thank goodness I'm not): {move}."],
  tip_good:["Ugh. Fine. {move}. Don't tell the others."],
  win:["Checkmate. Sit down."],lose:["...Rematch.","I'll remember this."],
  draw:["A draw. You were lucky. I was bored."],
  greet_lost:["You. I remember you."],greet_won:["Back for more?"],greet_drew:["Last time was a draw. This time won't be."],
  greet_grudge:["{name} took me last game. I've been practicing."]},
 sly:{
  taunt:["Lovely move. Truly. For us.","Keep doing exactly that.","Slip, slide.","Nobody watches the long diagonal."],
  capture:["Oops. For you.","Mm, crunchy.","Was that yours? It's mine now."],
  last:["You'll regret that... in a general sense.","How rude."],
  check_give:["Peekaboo. Check."],gloat:["Ohhh, that's going in the scrapbook."],
  tip_bad:["Psst. {move}. Trust me.","A little bird says {move}."],
  tip_good:["Annoyingly, {move} is good. I hate that I said that."],
  greet_grudge:["{name}. We meet again. Smile."]},
 feral:{
  taunt:["Hehehe.","Leap leap.","Smell fear.","Coming for your horses.","Your pawns smell nervous."],
  capture:["CHOMP.","Snack!","Crunchy one!"],
  last:["Bite... you... later...","Not fair!"],
  check_give:["CHECK! Hehe!"],gloat:["HAH! Blunder! BLUNDER!"],
  tip_bad:["Go {move}! Go go go!"],tip_good:["...{move}. Gnash didn't say that."],
  greet_grudge:["{name}! Bitey time again!"]},
 grunts:{
  taunt:["March.","Muddy out here.","Shoving forward.","Nice pieces. Shame if they got pawned.","We outnumber you. Sort of."],
  capture:["Got one!","Pawn power!","Ha! Little guy wins!"],
  last:["Tell Bog I owe him a coin.","Mud to mud."],
  check_give:["Check! Did I do that?"],gloat:["Even I saw that one coming."],
  tip_bad:["You should totally {move}."],tip_good:["Uh... {move}? Is that allowed?"],
  promote:["Promoted to {piece}. Bow, worms."],
  greet_grudge:["{name} got me last time. Not again. Probably."]},
};
const GEN={first_move:["Moving."],taunt:["Your move. Allegedly."],capture:["Got one."],streak:["That's {n}. Someone's keeping count. It's me."],
  last:["Ugh."],danger:["I'm in trouble here."],danger_again:["Them again. I'd like a transfer."],check_give:["Check."],check_recv:["Hey!"],
  advise:["{move}."],advise_sore:["Fine. {move}."],told:["Told you."],excuse:["Hm. That didn't work."],sulk:["Fine."],
  gloat:["Ha."],grudge:["Don't get used to it.","That was a moment of weakness."],promote:["Look at me now. A {piece}."],
  sacrificed:["Well. Here I stand."],hung:["I'm hanging out here."],hung_again:["Again? You left me hanging last time too.","Twice now. I'm keeping a list."],
  others_sacrifice:["Brave. Glad it's not me."],reply_boast:["Nice one, {name}."],challenge:["Careful. {name}'s tips have gone badly."],
  retort:["Talk all you like."],win:["Victory!"],lose:["Well. That happened."],draw:["A draw. Nobody wins, nobody's happy."],
  greet_returned:["I'm back. Try to keep me this time."],
  greet_sacrificed:["I'm told my sacrifice last game was 'tactically sound'. I was there. It wasn't fun."],
  greet_hero:["I delivered the mate last game. Just saying it out loud."],
  greet_lost:["You again."],greet_won:["Back for more?"],greet_drew:["Last time was a draw. Not this time."],
  greet_grudge:["{name} got me last time."],greet_regular:["Game {n}."]};

// Tips said in the piece's own motive. Mostly used for its bent advice, sometimes for honest advice, so the voice is a hint, not a tell.
const ADVISE_BIAS={
  braggart:["CHARGE! {move}! Glory waits for no knight!","{move}! Straight at them! What could go wrong?"],
  anxious:["{move}. It keeps more of us between me and them.","{move}. Defensive. Very defensive. The most defensive."],
  pompous:["{move}. Someone else should lead. Not the clergy.","{move}. The faithful go first. I'll follow. Eventually."],
  laconic:["{move}. Somebody's got to be brave. Not me.","{move}. Good for the team. Bad for someone on it."],
  sarcastic:["{move}. Put me where they can see me.","{move}. Let the queen work. Everyone else, watch."],
  cryptic:["{move}. The long diagonal wants it.","{move}. The angle insists."],
  pragmatic:["{move}. Simple. Probably."],
  chorus:["Forward! {move}!","{move}! Pawns only go one way!"],
};
for(const v in ADVISE_BIAS)L[v].advise_bias=ADVISE_BIAS[v];
L.menacing.respect=["Your {kind} was right. Embarrassing for everyone.","Fine. Your {kind} knew what it was doing. Once."];


// ---- who is who: ids are side + B<file> (back rank) or P<file> (pawns), as both games deal them ----
function castOf(id) {
  if (typeof id !== 'string' || !/^[wb][BP][0-7]$/.test(id)) return null;
  const c = id[0], f = +id[2];
  if (c === 'w') return id[1] === 'B' ? {c, name: WBACK[f][0], voice: WBACK[f][1]} : {c, name: WPAWN[f][0], voice: 'chorus'};
  return id[1] === 'B' ? {c, name: BBACK[f][0], voice: BBACK[f][1]} : {c, name: BPAWN[f], voice: 'grunts'};
}
function linesFor(voice, key) { return (L[voice] && L[voice][key]) || GEN[key] || []; }
function fillLine(t, v) { t = t.replace(/\{(\w+)\}/g, (_, k) => v[k] != null ? v[k] : ''); return t.charAt(0).toUpperCase() + t.slice(1); }
// The moments one move gives the pieces (the page's own rules, kept small): captures and last words, promotion, castling,
// checks, and now and then a piece's first move. `mem` is the game's cast memory {pieces, last} and is updated in place.
function reactions(before, m, after, mem, rnd) {
  rnd = rnd || Math.random; mem.pieces = mem.pieces || {}; mem.last = mem.last || {};
  const out = [];
  const say = (id, key, vars) => {  // key is the moment (capture, last, check_recv...), kept so a model can phrase the same moment
    const ch = castOf(id); if (!ch) return;
    const pool = linesFor(ch.voice, key); if (!pool.length) return;
    const k = ch.voice + '|' + key, choices = pool.length > 1 ? pool.filter(x => x !== mem.last[k]) : pool;
    const line = choices[Math.floor(rnd() * choices.length)]; mem.last[k] = line;
    const at = after.b.findIndex(p => p && p.id === id), t = at >= 0 ? after.b[at].t : (m.cap && m.cap.id === id ? m.cap.t : m.piece.t);
    const sq = at >= 0 ? at : (m.epCap != null ? m.epCap : m.to);  // a captured piece speaks from where it fell
    out.push({id, name: ch.name, side: ch.c, piece: core.TNAME[t], text: fillLine(line, vars || {}), sq, key});
  };
  const mid = m.piece.id, pm = mem.pieces[mid] = mem.pieces[mid] || {moves: 0, captures: 0};
  pm.moves++;
  if (m.cap && m.cap.id) {
    pm.captures++;
    const notable = pm.captures === 1 || m.cap.t !== 'p';
    if (notable || rnd() < .35) say(mid, pm.captures >= 2 ? 'streak' : 'capture', {n: pm.captures});
    if (m.cap.t !== 'p' || rnd() < .5) say(m.cap.id, 'last');
  }
  if (m.promo) say(mid, 'promote', {piece: core.TNAME[m.promo].toUpperCase()});
  if (m.castle && rnd() < .6) say(mid, 'castle');
  if (core.inCheck(after, after.turn)) {
    if (rnd() < .6) say(mid, 'check_give');
    const k = after.b[core.kingSq(after.b, after.turn)]; if (k && k.id) say(k.id, 'check_recv');
  }
  if (!out.length && pm.moves === 1 && rnd() < .3) say(mid, m.piece.c === 'w' ? 'first_move' : 'taunt');
  return out.slice(0, 3);
}
// How each voice sounds, for a model phrasing its lines (talking heads as model calls, James 11-09).
const VOICE_DESC = {
  braggart: 'boastful and theatrical; confidence far exceeds reliability; craves glory and charging forward',
  anxious: 'nervous and self-protective; worries constantly; wants everyone else between the king and danger',
  sarcastic: 'arrogant, sarcastic and vain; knows the queen does most of the work and says so',
  laconic: 'terse and dry, one to five words; happy for someone else to be brave',
  pompous: 'pompous clergy; self-important; prefers that others go first',
  cryptic: 'cryptic and oracular; speaks in angles, lines and omens',
  pragmatic: 'plain, practical and honest; no flair',
  chorus: 'an eager, small, brave and slightly silly pawn',
  menacing: 'menacing and cold; keeps a frosty dignity even in defeat',
  sly: 'sly and sweetly treacherous',
  feral: 'feral and gleeful; bites first',
  grunts: 'a grubby, blunt foot-soldier pawn'};
// Every piece still on the board, as a cast list: who could speak or answer.
function roster(st) {
  const out = [];
  st.b.forEach((p, sq) => { const ch = p && castOf(p.id); if (ch) out.push({id: p.id, name: ch.name, side: ch.c, piece: core.TNAME[p.t], voice: ch.voice, desc: VOICE_DESC[ch.voice], sq}); });
  return out;
}
return {BLURB, WBACK, WPAWN, BBACK, BPAWN, L, GEN, ADVISE_BIAS, VOICE_DESC, castOf, linesFor, fillLine, reactions, roster};
});
