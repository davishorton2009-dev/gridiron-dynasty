/* =====================================================================
   GRIDIRON DYNASTY · RULES
   ---------------------------------------------------------------------
   The numbers and lists for the football game (gridiron-game.js).
   Change a number here and the game follows.

   You are the Offensive Coordinator AND the Defensive Coordinator.
   Every snap you pick one of three calls. Smart calls build team
   chemistry and player XP; bad calls tear them down. Every team in
   the league starts at exactly the same strength.
   ===================================================================== */
window.GRID = {

  /* Money you start your career with */
  startCash: 120,

  /* Paid after every game */
  pay: { base: 40, win: 60, tie: 30, gradeA: 40, gradeB: 20, playoffWin: 80, title: 200 },

  /* Game length. Quarters are short so a game is about 50 calls. */
  quarterSec: 240, otSec: 180,

  /* Chemistry (0 to 100, starts at 50). At 100 every player plays
     'chemPts' points better; at 0, that much worse. */
  chemStart: 50, chemPts: 7,
  chemPerCall: { smart: 0.22, ok: 0.05, even: 0.1, bad: -0.26 },

  /* Every team, yours included, starts at a random overall in this range,
     with three strong positions and three weak ones */
  startRange: [50, 62],
  /* The opening draft before season 1, in power-ranking order (weakest first).
     A bigger, slightly stronger class so it can fix weak spots. */
  openingDraft: { poolSize: 90, boost: 3 },

  /* Season: 8 teams, 7 games each, then the top 4 make the playoffs */
  playoffTeams: 4,
  /* Win fewer than this many regular-season games two seasons running
     and you're fired */
  hotSeatWins: 2,

  /* Flags: chance per snap of a pre-snap flag, and of one during the play */
  flags: { pre: 0.035, during: 0.06 },

  /* The snap (your offense only): a red bar turns green after a random
     wait (ms, between wait[0] and wait[1]). Hit Space or tap it:
     before green, or quicker than `jump` ms after it (a guess), is a false
     start; slower than `window` ms and the rush beats you to it: a sack on
     a pass, a fumbled exchange on a run. */
  snap: { wait: [900, 2800], jump: 100, window: 450, lateFumble: 0.3, runLost: 0.5 },

  /* Player levels: total player XP needed for each level (1 to 10).
     Each level adds 1 to every rating. */
  levels: [0, 40, 100, 180, 280, 400, 540, 700, 880, 1080],
  train: { price: 35, gives: 30 },

  /* Training camp: send 1 to `max` of your players away for 2, 3 or 4 of your games, for one
     upfront price. While they're away they can't play, be traded, trained, released or put in
     the lineup. Each comes back a random number of levels higher, from levels[games] (top level 10). */
  camp: { price: 100, max: 10, levels: { 2: [4, 6], 3: [5, 8], 4: [7, 10] } },
  /* AI players earn this much XP every week, about what an average
     play-caller's players earn. Call smarter than average to pull ahead. */
  aiXpPerGame: 26,

  /* Bench: backups, rookies and trade pickups beyond the 15 starters */
  benchMax: 12,

  /* The draft, NFL style: after every season, 7 rounds, the same order every
     round. Teams that missed the playoffs pick first (worst record first),
     then playoff teams by how early they were knocked out; the runner-up
     picks second to last and the champion last. Picks can be traded,
     including the next two years' picks. */
  draft: {
    rounds: 7, poolSize: 72,
    /* how far off your scouts can be on a prospect, before you draft him */
    scoutOvr: 3, scoutPot: 4,
    colleges: ['Alabama', 'Ohio State', 'Georgia', 'LSU', 'Michigan', 'Texas', 'USC', 'Clemson', 'Oregon', 'Notre Dame',
      'Penn State', 'Florida', 'Oklahoma', 'Miami', 'Wisconsin', 'Iowa', 'Auburn', 'Tennessee', 'Utah', 'TCU',
      'Boise State', 'Washington', 'Florida State', 'Texas A&M', 'Ole Miss', 'Stanford', 'Nebraska', 'Kentucky',
      'Appalachian State', 'North Dakota State', 'Jackson State', 'Toledo', 'Fresno State', 'Tulane', 'Memphis'],
  },

  /* Trades: an AI team says yes when what it gets is worth at least 'edge' ×
     what it gives. One unit of value (about a 60-overall starter) costs
     'drPerUnit' dollars as a cash sweetener. */
  trade: { edge: 1.06, drPerUnit: 40, sweeteners: [0, 10, 25, 50, 100, 200, 400] },

  /* Free agents: price = base × grow^(overall − 60). A new list after every game. */
  market: { size: 6, base: 30, grow: 1.12, refresh: 10 },
  /* Letting a player go pays this share of his market price */
  releaseShare: 0.4,

  /* End of season: each player's ratings move by (chemistry − 50) ÷ this,
     so a happy locker room grows and a miserable one shrinks */
  seasonGrowDiv: 10,

  /* Ratings, 1 to 100 */
  abilities: {
    arm: ['ARM', 'Arm strength'], acc: ['ACC', 'Accuracy'], iq: ['IQ', 'Decisions'], mob: ['MOB', 'Mobility'],
    spd: ['SPD', 'Speed'], pow: ['POW', 'Power'], hands: ['HND', 'Hands'], route: ['RTE', 'Route running'], block: ['BLK', 'Blocking'],
    kpow: ['LEG', 'Leg strength'], kacc: ['KAC', 'Kick accuracy'],
    rush: ['RSH', 'Pass rush'], runD: ['RUN', 'Run defense'], cover: ['COV', 'Coverage'], tackle: ['TKL', 'Tackling'], ball: ['BALL', 'Ball skills'],
  },
  positions: {
    QB: { name: 'Quarterback',   ab: ['arm', 'acc', 'iq', 'mob'], nums: [[1, 19]] },
    RB: { name: 'Running back',  ab: ['spd', 'pow', 'hands'],     nums: [[20, 49]] },
    WR: { name: 'Wide receiver', ab: ['spd', 'hands', 'route'],   nums: [[10, 19], [80, 89]] },
    TE: { name: 'Tight end',     ab: ['block', 'hands', 'route'], nums: [[80, 89], [40, 49]] },
    K:  { name: 'Kicker',        ab: ['kpow', 'kacc'],            nums: [[1, 19]] },
    DL: { name: 'Defensive line', ab: ['rush', 'runD'],           nums: [[90, 99], [50, 79]] },
    LB: { name: 'Linebacker',    ab: ['runD', 'cover', 'tackle'], nums: [[40, 59]] },
    CB: { name: 'Cornerback',    ab: ['cover', 'spd', 'ball'],    nums: [[20, 39]] },
    S:  { name: 'Safety',        ab: ['cover', 'tackle', 'ball'], nums: [[20, 49]] },
  },
  /* Your lineup, fantasy style, plus a defense: [slot, position] */
  slots: [['QB', 'QB'], ['RB1', 'RB'], ['RB2', 'RB'], ['WR1', 'WR'], ['WR2', 'WR'], ['WR3', 'WR'], ['TE', 'TE'], ['K', 'K'],
    ['DL1', 'DL'], ['DL2', 'DL'], ['LB1', 'LB'], ['LB2', 'LB'], ['CB1', 'CB'], ['CB2', 'CB'], ['S', 'S']],

  /* Offensive plays. 'slots' = who can get the ball.
     'base' = which of the eight core plays it runs like on the field
     (dive, sweep, sneak, slant, screen, seam, bomb, pa; leave it out for
     the core play itself). 'adj' nudges how it does against each family
     of defense (stack, cover2, blitz, cover3, prevent), on top of its base.
     Optional tweaks: y (run: extra average yards; pass: extra air yards),
     sd (run: how boom-or-bust, 1 = normal), open (extra chance to get open),
     sack (extra sack chance), big (a QB run that can break long),
     ai (how often AI coordinators call it, 1 = normal). */
  plays: [
    /* inside runs */
    { id: 'dive',    name: 'Inside run',       group: 'run', slots: ['RB1', 'RB2'], what: 'Hand it off straight up the middle.' },
    { id: 'power',   name: 'Power O',          group: 'run', base: 'dive', slots: ['RB1', 'RB2'], y: .2, adj: { stack: 1, cover2: -1 }, what: 'A pulling guard leads the back into the hole. Built to move a crowded box.' },
    { id: 'trap',    name: 'Trap',             group: 'run', base: 'dive', slots: ['RB1', 'RB2'], adj: { blitz: 2, stack: 1, cover3: -1 }, what: 'Let a rusher come free, then kick him out. Burns aggressive fronts.' },
    { id: 'draw',    name: 'HB draw',          group: 'run', base: 'dive', slots: ['RB1', 'RB2'], y: -.3, adj: { blitz: 2, cover2: 1 }, what: 'Show pass, then hand it off. Best against blitzes and soft zones.' },
    { id: 'counter', name: 'Counter',          group: 'run', base: 'dive', slots: ['RB1', 'RB2'], sd: 1.2, adj: { stack: 1, blitz: 1, cover2: -1 }, what: 'Step one way, cut back the other. Punishes over-pursuit.' },
    { id: 'iso',     name: 'Iso lead',         group: 'run', base: 'dive', slots: ['RB1', 'RB2'], sd: .75, adj: { cover3: 1, prevent: -1 }, what: 'Lead blocker goes straight at the linebacker. Steady, few negative plays.' },
    { id: 'izone',   name: 'Inside zone',      group: 'run', base: 'dive', slots: ['RB1', 'RB2'], sd: .9, adj: { cover3: 1, cover2: -1 }, what: 'Linemen block an area and the back picks his crease.' },
    { id: 'wedge',   name: 'Wedge',            group: 'run', base: 'dive', slots: ['RB1', 'RB2'], y: -1, sd: .5, adj: { stack: 1, cover2: -1, prevent: -1 }, what: 'Everyone blocks down in a wall. A yard or two, almost never a loss.' },
    { id: 'zread',   name: 'Zone read',        group: 'run', base: 'dive', slots: ['RB1', 'RB2'], sd: 1.15, adj: { blitz: 2, stack: 1, prevent: -1 }, what: 'The QB reads the end and gives or keeps. Freezes blitzers.' },
    /* outside runs */
    { id: 'sweep',   name: 'Outside sweep',    group: 'run', slots: ['RB1', 'RB2'], what: 'Pitch it wide and race the defense to the edge. Boom or bust.' },
    { id: 'toss',    name: 'Toss crack',       group: 'run', base: 'sweep', slots: ['RB1', 'RB2'], adj: { stack: 1, cover2: -1 }, what: 'Quick pitch while a receiver cracks down on the end. Gets outside fast.' },
    { id: 'ozone',   name: 'Outside zone',     group: 'run', base: 'sweep', slots: ['RB1', 'RB2'], sd: .8, adj: { cover3: 1, blitz: -1 }, what: 'The line flows sideways and the back cuts upfield at the first daylight.' },
    { id: 'pitch',   name: 'Option pitch',     group: 'run', base: 'sweep', slots: ['RB1', 'RB2'], sd: 1.3, adj: { blitz: 1, stack: 1, cover3: -1 }, what: 'The QB runs at the edge and pitches at the last second. Wild results.' },
    { id: 'jet',     name: 'Jet sweep',        group: 'run', base: 'sweep', slots: ['RB1', 'RB2'], y: .2, sd: 1.1, adj: { cover3: 1, cover2: -1, stack: 1 }, what: 'The motion man takes it at full speed across the formation.' },
    { id: 'reverse', name: 'Reverse',          group: 'run', base: 'sweep', slots: ['RB1', 'RB2'], y: -.5, sd: 1.6, ai: .4, adj: { blitz: 1, stack: 2, prevent: -1, cover3: -1 }, what: 'Start one way, hand off going the other. Huge gain or a big loss.' },
    /* QB runs */
    { id: 'sneak',   name: 'QB sneak',         group: 'run', slots: ['QB'], what: 'Quarterback dives behind the center. Only good for a yard or two.' },
    { id: 'qbdraw',  name: 'QB draw',          group: 'run', base: 'sneak', slots: ['QB'], y: 2.4, sd: 2.6, big: true, ai: .5, adj: { blitz: 2, cover3: -1 }, what: 'Drop back like it’s a pass, then the QB takes off up the middle.' },
    { id: 'keeper',  name: 'QB keeper',        group: 'run', base: 'sneak', slots: ['QB'], y: 2.2, sd: 2.4, big: true, ai: .5, adj: { stack: 1, cover2: -1 }, what: 'Fake the handoff and the QB keeps it around the end.' },
    /* quick passes */
    { id: 'slant',   name: 'Quick slant',      group: 'short', slots: ['WR1', 'WR2', 'WR3'], what: 'Fast, short throw over the middle. Ball out before a blitz gets home.' },
    { id: 'hitch',   name: 'Hitch',            group: 'short', base: 'slant', slots: ['WR1', 'WR2', 'WR3'], y: -2, open: .05, adj: { cover3: 1, blitz: -1 }, what: 'Five yards and turn around. An easy completion against soft coverage.' },
    { id: 'qout',    name: 'Quick out',        group: 'short', base: 'slant', slots: ['WR1', 'WR2', 'WR3'], adj: { cover3: 1, cover2: -1, prevent: 1 }, what: 'A fast throw to the sideline. Beats off coverage; risky against a corner sitting on it.' },
    { id: 'stick',   name: 'Stick',            group: 'short', base: 'slant', slots: ['TE', 'WR3'], adj: { cover3: 1, stack: -1 }, what: 'The tight end sits down in the hole of the zone.' },
    { id: 'curl',    name: 'Curl',             group: 'short', base: 'slant', slots: ['WR1', 'WR2', 'WR3'], y: 1.5, sack: .01, adj: { cover2: 1, blitz: -1 }, what: 'Ten yards and come back to the ball. Finds the soft spot in a zone.' },
    { id: 'drag',    name: 'Shallow cross',    group: 'short', base: 'slant', slots: ['WR1', 'WR2', 'WR3', 'TE'], adj: { blitz: 1, cover2: 1, prevent: -1 }, what: 'A receiver drags across right behind the line. Kills blitzes.' },
    { id: 'mesh',    name: 'Mesh',             group: 'short', base: 'slant', slots: ['WR1', 'WR2', 'WR3'], adj: { cover3: 1, cover2: 1, stack: -1 }, what: 'Two receivers cross underneath and rub off their defenders. A man-beater.' },
    { id: 'flat',    name: 'RB flat',          group: 'short', base: 'slant', slots: ['RB1', 'RB2'], y: -3, open: .08, adj: { stack: 1 }, what: 'The back leaks out to the flat. The safety valve.' },
    /* screens */
    { id: 'screen',  name: 'RB screen',        group: 'short', slots: ['RB1', 'RB2'], what: 'Let the rush through, dump it to the back behind them.' },
    { id: 'bubble',  name: 'Bubble screen',    group: 'short', base: 'screen', slots: ['WR1', 'WR2', 'WR3'], adj: { stack: 1, blitz: -1, cover3: 1 }, what: 'Instant throw to a receiver behind a wall of blockers on the outside.' },
    { id: 'tescreen', name: 'TE screen',       group: 'short', base: 'screen', slots: ['TE'], open: .05, adj: { stack: 1, cover2: 1 }, what: 'The tight end slips out behind the rush with linemen in front.' },
    { id: 'tunnel',  name: 'Tunnel screen',    group: 'short', base: 'screen', slots: ['WR1', 'WR2', 'WR3'], adj: { cover2: 1, prevent: 1 }, what: 'The receiver cuts inside behind his linemen.' },
    /* middle routes */
    { id: 'seam',    name: 'TE seam route',    group: 'short', slots: ['TE'], what: 'Tight end splits the zone up the middle.' },
    { id: 'dig',     name: 'Dig route',        group: 'short', base: 'seam', slots: ['WR1', 'WR2', 'WR3'], y: 2, adj: { cover3: 1, cover2: -1 }, what: 'Fifteen yards and break inside, behind the linebackers.' },
    { id: 'wheel',   name: 'RB wheel',         group: 'short', base: 'seam', slots: ['RB1', 'RB2'], y: 4, open: -.05, adj: { blitz: 1, cover3: 1, cover2: -1 }, what: 'The back runs to the flat, then turns it up the sideline. Linebackers can’t keep up.' },
    { id: 'levels',  name: 'Levels',           group: 'short', base: 'seam', slots: ['WR1', 'WR2', 'TE'], adj: { cover3: 2, stack: -1, blitz: -1 }, what: 'Receivers at two depths over the middle. Stretches a zone top to bottom.' },
    { id: 'ycross',  name: 'Y-cross',          group: 'short', base: 'seam', slots: ['TE'], y: 1, sack: .02, adj: { cover3: 1, prevent: 1 }, what: 'The tight end crosses deep over the middle.' },
    { id: 'dcross',  name: 'Deep cross',       group: 'short', base: 'seam', slots: ['WR1', 'WR2', 'WR3'], y: 3, sack: .02, adj: { stack: 1, cover3: 1, blitz: -1 }, what: 'A receiver runs all the way across the field, 15 yards deep.' },
    /* deep shots */
    { id: 'bomb',    name: 'Deep bomb',        group: 'deep', slots: ['WR1', 'WR2', 'WR3'], what: 'Go route. Huge gain or nothing, and picks happen.' },
    { id: 'post',    name: 'Post route',       group: 'deep', base: 'bomb', slots: ['WR1', 'WR2', 'WR3'], adj: { cover3: 1, cover2: -1 }, what: 'Deep, then break toward the goalposts. Splits a single high safety.' },
    { id: 'corner',  name: 'Corner route',     group: 'deep', base: 'bomb', slots: ['WR1', 'WR2', 'WR3', 'TE'], adj: { cover2: 2, cover3: -1 }, what: 'Deep, then break to the pylon. Attacks two-deep zones.' },
    { id: 'fade',    name: 'Back-shoulder fade', group: 'deep', base: 'bomb', slots: ['WR1', 'WR2'], y: -6, sack: -.03, adj: { blitz: 2, stack: -1 }, what: 'Throw it where only your receiver can catch it. Quick enough to beat a blitz.' },
    { id: 'verts',   name: 'Four verticals',   group: 'deep', base: 'bomb', slots: ['WR1', 'WR2', 'WR3', 'TE'], sack: .01, adj: { cover3: 2, blitz: -1 }, what: 'Everyone runs deep. Overloads three-deep coverage.' },
    { id: 'dmove',   name: 'Double move',      group: 'deep', base: 'bomb', slots: ['WR1', 'WR2', 'WR3'], sack: .03, adj: { cover2: 1, cover3: 1, blitz: -1 }, what: 'Fake a short route, then go. Burns jumpy defenders, but needs time.' },
    { id: 'sail',    name: 'Sail',             group: 'deep', base: 'bomb', slots: ['WR1', 'WR2', 'WR3'], y: -4, adj: { cover3: 2, stack: -1, prevent: 1 }, what: 'Three levels on one sideline; the deep out is the money throw.' },
    { id: 'hail',    name: 'Hail Mary',        group: 'deep', base: 'bomb', slots: ['WR1', 'WR2', 'WR3'], y: 14, open: -.3, ai: .1, what: 'Everybody to the end zone. Chuck it and pray.' },
    /* play-action */
    { id: 'pa',      name: 'Play-action deep', group: 'deep', slots: ['WR1', 'WR2', 'TE'], what: 'Fake the handoff, throw deep. Works best once your run game is going.' },
    { id: 'boot',    name: 'Bootleg',          group: 'deep', base: 'pa', slots: ['TE', 'WR3', 'RB1'], y: -10, sack: -.03, open: .1, adj: { blitz: 1, cover2: 1, prevent: 1 }, what: 'Fake the run, the QB rolls out and hits a crosser. Safer than a deep shot.' },
    { id: 'papost',  name: 'PA post',          group: 'deep', base: 'pa', slots: ['WR1', 'WR2'], adj: { cover3: 1, cover2: -1 }, what: 'Sell the run, then hit the post behind the safeties who bit.' },
    { id: 'flea',    name: 'Flea flicker',     group: 'deep', base: 'pa', slots: ['WR1', 'WR2', 'WR3'], y: 6, sack: .04, ai: .3, adj: { cover2: 1 }, what: 'Handoff, pitch back to the QB, bomb. The trick play.' },
    { id: 'pacross', name: 'PA crossers',      group: 'deep', base: 'pa', slots: ['WR1', 'WR2', 'WR3', 'TE'], y: -4, adj: { cover2: 2 }, what: 'Fake the run and send receivers crossing behind the linebackers.' },
  ],

  /* Defensive calls. 'base' = the family it plays like (stack, cover2, blitz,
     cover3, prevent; leave it out for the family's own call). 'adj' nudges how
     each kind of play does against it (keyed by play base; minus is good for
     the defense). 'sack' = extra sack chance. */
  defs: [
    /* run fronts */
    { id: 'stack',   name: 'Stack the box', what: 'Eight men up close.' },
    { id: 'goal',    name: 'Goal-line front', base: 'stack', sack: -.01, adj: { sneak: -1, slant: 1, seam: 1 }, what: 'Heavy bodies, everyone in the box. Nothing gets up the middle.' },
    { id: 'bear',    name: '46 Bear',       base: 'stack', sack: .02, adj: { sweep: -1, screen: 1 }, what: 'Linebackers crowd the line. Smothers runs and chases the QB.' },
    { id: 'runblitz', name: 'Run blitz',    base: 'stack', sack: .01, adj: { sweep: -1, screen: 1, pa: -1 }, what: 'Linebackers shoot the gaps at the snap.' },
    { id: 'eight',   name: 'Eight-man front', base: 'stack', adj: { slant: -1, screen: -1, seam: 1 }, what: 'A safety rolls down into the box. Strong against the run and quick throws, thin deep.' },
    /* two-deep zones */
    { id: 'cover2',  name: 'Cover 2 zone',  what: 'Two deep safeties, zones underneath.' },
    { id: 'tampa2',  name: 'Tampa 2',       base: 'cover2', adj: { seam: -2 }, what: 'Cover 2 with the middle linebacker dropping deep. Closes the seam.' },
    { id: 'twoman',  name: '2-man under',   base: 'cover2', adj: { slant: -1, seam: -1, dive: 1 }, what: 'Man coverage underneath, two safeties over the top. Tough to throw on, soft against the run.' },
    { id: 'quarters', name: 'Cover 4 quarters', base: 'cover2', adj: { bomb: -1, pa: -1, dive: -1, slant: 1 }, what: 'Four deep defenders. Takes away the deep ball and the safeties help on runs.' },
    { id: 'cover6',  name: 'Cover 6',       base: 'cover2', adj: { seam: -1, slant: 1 }, what: 'Half quarters, half Cover 2.' },
    /* blitzes */
    { id: 'blitz',   name: 'All-out blitz', what: 'Send everybody at the QB.' },
    { id: 'firezone', name: 'Fire zone blitz', base: 'blitz', sack: -.02, adj: { slant: -1, screen: -2 }, what: 'Five rush and a lineman drops into the passing lane.' },
    { id: 'cbblitz', name: 'Corner blitz',  base: 'blitz', adj: { sweep: -2, bomb: 1 }, what: 'A cornerback comes off the edge.' },
    { id: 'agap',    name: 'A-gap blitz',   base: 'blitz', adj: { dive: -1, sneak: -1, screen: -1 }, what: 'Linebackers fire straight up the middle.' },
    { id: 'safblitz', name: 'Safety blitz', base: 'blitz', adj: { seam: 1, slant: -1, bomb: 1 }, what: 'A safety comes down late and hits the QB.' },
    { id: 'cover0',  name: 'Cover 0',       base: 'blitz', sack: .04, adj: { bomb: 2, pa: 1 }, what: 'Everybody blitzes, no deep help. Live and die by it.' },
    { id: 'simpress', name: 'Simulated pressure', base: 'blitz', sack: -.05, adj: { slant: -2, screen: -2, dive: 1 }, what: 'Show blitz, rush four, drop the rest. Fools quick throws.' },
    /* single-high */
    { id: 'cover3',  name: 'Cover 3 base',  what: 'Balanced, safe, three deep.' },
    { id: 'cover1',  name: 'Cover 1 man',   base: 'cover3', adj: { slant: -1, seam: -1, pa: 1 }, what: 'Man-to-man with one deep safety. Tight on receivers.' },
    { id: 'robber',  name: 'Cover 1 robber', base: 'cover3', adj: { slant: -2, bomb: 1 }, what: 'A safety lurks over the middle to jump crossing routes.' },
    { id: 'buzz',    name: 'Cover 3 buzz',  base: 'cover3', adj: { slant: -1, screen: -1, sweep: -1 }, what: 'A safety buzzes down to the flat.' },
    { id: 'spy',     name: 'QB spy',        base: 'cover3', adj: { sneak: -2, pa: -1, dive: 1 }, what: 'Cover 3 with a linebacker shadowing the quarterback.' },
    { id: 'nickel',  name: 'Nickel zone',   base: 'cover3', adj: { dive: 1, seam: -1, slant: -1 }, what: 'A fifth defensive back replaces a linebacker.' },
    /* soft */
    { id: 'prevent', name: 'Prevent',       what: 'Everyone backs way off.' },
    { id: 'dime',    name: 'Dime package',  base: 'prevent', adj: { slant: -1, seam: -1 }, what: 'Six defensive backs. Built to stop the pass on long downs.' },
  ],

  /* Your playbook: pick this many plays per side. Each snap you're dealt
     three of them, spread across run / short / deep when you can. */
  playbook: { min: 3, max: 6,
    off: ['dive', 'sweep', 'slant', 'screen', 'bomb', 'pa'],
    def: ['stack', 'cover2', 'blitz', 'cover3', 'prevent', 'cover1'] },

  /* Core play vs core defense: how much each play likes each defense (−2 to +2).
     Positive is good for the offense. Every other play and defense starts from
     its base row/column here, plus its own 'adj'. */
  matrix: {
    dive:   { stack: -2, cover2:  1, blitz: -1, cover3:  0, prevent:  2 },
    sweep:  { stack: -1, cover2:  1, blitz:  1, cover3:  0, prevent:  1 },
    sneak:  { stack: -1, cover2:  1, blitz:  0, cover3:  1, prevent:  2 },
    slant:  { stack:  1, cover2: -1, blitz:  1, cover3:  0, prevent:  1 },
    screen: { stack:  0, cover2:  0, blitz:  2, cover3:  0, prevent:  1 },
    seam:   { stack:  1, cover2:  1, blitz:  0, cover3: -1, prevent:  0 },
    bomb:   { stack:  2, cover2: -1, blitz: -1, cover3: -1, prevent: -2 },
    pa:     { stack:  2, cover2: -1, blitz: -2, cover3:  0, prevent: -2 },
  },
  /* names for each family, used in scouting and the playbook */
  playFam: { dive: 'Inside runs', sweep: 'Outside runs', sneak: 'QB runs', slant: 'Quick passes', screen: 'Screens', seam: 'Middle routes', bomb: 'Deep shots', pa: 'Play-action' },
  defFam: { stack: 'Run fronts', cover2: 'Two-deep zones', blitz: 'Blitzes', cover3: 'Single-high', prevent: 'Soft coverage' },

  /* Injuries. Each snap, the player with the ball and the defender who made the
     play might get hurt. About one injury on your team every 2-3 games
     (~35 run/pass snaps a game, ~23 "exposures" for your side x perSnap). */
  injury: {
    perSnap: .016,     /* the ball carrier / target on a contact play */
    sackQB: .035,      /* the quarterback on a sack */
    defShare: .6,      /* the defender's chance, as a share of the above */
    aiWeekly: .4,      /* other AI teams: chance one starter gets hurt each week */
    kinds: [
      { w: .52, g: [1, 1], names: ['Sprained ankle', 'Bruised ribs', 'Tight hamstring', 'Jammed finger', 'Stinger', 'Hip pointer'] },
      { w: .30, g: [2, 3], names: ['Pulled hamstring', 'High ankle sprain', 'Shoulder sprain', 'Concussion', 'Knee sprain'] },
      { w: .14, g: [4, 6], names: ['Broken hand', 'Sprained MCL', 'Turf toe', 'Broken ribs'] },
      { w: .04, g: [99, 99], names: ['Torn ACL', 'Broken leg', 'Torn Achilles'] },
    ],
  },

  /* Passing: first the game decides if the target got OPEN or is COVERED.
     Chance he's open = openBase + perEdge x the edge (play vs defense call,
     plus receiver vs defender). Then:
       open    -> almost always caught, almost never picked
       covered -> usually incomplete, and picks are very likely */
  coverage: {
    openBase: { slant: .70, screen: .80, seam: .65, bomb: .40, pa: .50 },
    perEdge: .15,
    open:    { comp: .90, deepComp: .85, int: .005 },
    covered: { comp: .20, deepComp: .12, int: .15, deepInt: .20 },
  },

  /* Your defensive decisions. These only come up when you call the defense yourself;
     "Let the assistant finish the game" and AI-vs-AI games never stop for them.
     Pairs like [a, b] are a base plus a per-rating-point amount (rating minus 60), and
     the matching ...Cap is [lowest, highest].

     jump: their QB forces a throw into coverage and you jump the route.
       int        interception chance: base + per point of your defender's 'ball' rating
       lookOff    chance their QB looks you off: base + per point of his 'iq'
       perJump    added to lookOff for every route you've already jumped this game
       fav        taken off lookOff when he throws to his most-targeted receiver (he's predictable)
       lookedInt  your interception chance when he did look you off
       pick6      share of those interceptions returned for a touchdown
       missYac    a missed jump: yards after the catch [min, max], nobody behind him
     play: you stay on the receiver instead.
       comp       completion chance, as a share of the normal covered-throw rate (coverage.covered)
       int, yacCap interception chance, and the most yards he gets after the catch
     tackle: a run breaks into the open field and your last defender decides.
       strip      forced-fumble chance: base + per point of his 'tackle' rating
       missYds    a missed strip: extra yards [min, max] on top of the run
       wrap       yards past the second level where you bring him down [min, max]
       whiff      chance he breaks the wrap-up anyway: base - per point of 'tackle'
     sell: 3rd or 4th and `short` yards or less, two extra cards.
       mult       the play-vs-defense matrix swing is multiplied by this: in your favour when you
                  guess right, against you when you guess wrong (at least minSwing either way)
       run, pass  the defense each sell-out lines up in */
  defCalls: {
    jump: { int: [0.45, 0.012], intCap: [0.2, 0.7], lookOff: [0.12, 0.008], perJump: 0.07, fav: 0.12, lookCap: [0.03, 0.55],
            lookedInt: 0.06, pick6: 0.18, missYac: [12, 30] },
    play: { comp: 0.7, int: 0.01, yacCap: 4 },
    tackle: { strip: [0.32, 0.006], stripCap: [0.15, 0.5], missYds: [6, 18], wrap: [1, 4], whiff: [0.1, 0.004], whiffCap: [0.02, 0.2] },
    sell: { short: 2, mult: 2, minSwing: 0.75, run: 'goal', pass: 'twoman' },
  },

  /* The kick mini game (your field goals and extra points). A marker sweeps across a bar with
     the goalposts on it and you tap to lock your aim. Wind shifts the posts, so you aim into it.
     sigma    how far off a typical tap lands (in half-bar widths). The posts are spaced so a tap
              this good makes the kick about as often as the normal odds would
     gen      extra width on top of that (1 = an exact match, more = friendlier)
     zone     narrowest and widest the posts can be [min, max], in half-bar widths
     edge     beyond this share of the way to a post, the kick can clang off the upright...
     doink    ...this often
     sweep    seconds for the marker to cross the bar [20-yard kick, 60-yard kick]
     wind     how far a full-strength wind shifts the posts [20 yards, 60 yards]
     windMax  mph of a full-strength wind
     Kicks past the kicker's range can still fall short, with the same odds as before. */
  kick: { sigma: 0.13, gen: 1.1, zone: [0.06, 0.48], edge: 0.85, doink: 0.5, sweep: [0.9, 0.55], wind: [0.15, 0.45], windMax: 20 },

  /* Longest field goal you're offered (yards), on any down */
  fgMaxTry: 65,

  /* After a touchdown: kick for 1 (xp = chance for an average kicker,
     a 33-yard try) or run a play from the 2 for 2. The AI goes for two in
     the 4th quarter when the margin after the touchdown is one of go2. */
  pat: { xp: 0.94, ball: 98, go2: [1, 5, 12, -2, -5, -10] },

  /* Special teams. Kickoffs are from the kicking team's 35.
     tbDeep: a deep kick into the end zone is downed for a touchback this often
     koRet / puntRet: return yards [average, spread]
     onside: the kicking team's recovery chance vs a normal return team / the hands team
     puntBlock: chance to block a punt when you send the rush (rough: roughing the kicker)
     fgBlock: chance to block a field goal [normal rush, all-out block]
     fake: chance a fake converts, by the other team's call; each fake you've already run this game
     multiplies it by fakeWise (they're on alert). aiFake: how often the AI fakes */
  st: {
    tbDeep: 0.6, koRet: [21, 7], puntRet: [7, 6],
    onside: { surprise: 0.3, hands: 0.08 },
    puntBlock: 0.07, rough: 0.04, fgBlock: [0.015, 0.06],
    fake: { punt: { ptBlk: 0.6, ptRet: 0.42, ptFc: 0.36 }, fg: { fgBlk: 0.55, fgSafe: 0.3 } }, fakeWise: 0.7,
    aiFake: 0.04,
  },
  /* Chance a throwaway draws an intentional grounding flag (−10 and loss of down) */
  groundingChance: 0.06,

  /* AI play-calling styles. Weights for each family of play / defense on a
     normal down; the weight is shared by every play in that family. */
  offStyles: {
    run:      { name: 'Run-heavy',    w: { dive: .30, sweep: .22, slant: .16, screen: .08, seam: .08, bomb: .08, pa: .08 } },
    balanced: { name: 'Balanced',     w: { dive: .22, sweep: .16, slant: .22, screen: .10, seam: .10, bomb: .10, pa: .10 } },
    pass:     { name: 'Pass-happy',   w: { dive: .14, sweep: .10, slant: .30, screen: .12, seam: .12, bomb: .12, pa: .10 } },
    deep:     { name: 'Gunslingers',  w: { dive: .16, sweep: .12, slant: .16, screen: .08, seam: .08, bomb: .24, pa: .16 } },
  },
  defStyles: {
    blitz:    { name: 'Blitz-happy',  w: { stack: .18, cover2: .18, blitz: .36, cover3: .22, prevent: .06 } },
    zone:     { name: 'Zone coverage', w: { stack: .14, cover2: .34, blitz: .12, cover3: .32, prevent: .08 } },
    stack:    { name: 'Run-stoppers', w: { stack: .38, cover2: .16, blitz: .16, cover3: .24, prevent: .06 } },
    balanced: { name: 'Balanced',     w: { stack: .22, cover2: .24, blitz: .20, cover3: .28, prevent: .06 } },
  },
  /* How hard the AI leans into countering what you've been calling lately */
  aiAdapt: 0.4,

  /* Names */
  names: {
    alt: ['Buck', 'Duke', 'Ace', 'Rocco', 'Bubba', 'Tank', 'Biff', 'Chet', 'Skip', 'Moose', 'Dusty', 'Rusty', 'Sonny',
      'Butch', 'Cash', 'Rex', 'Flash', 'Scooter', 'Booker', 'Champ', 'Lefty', 'Spike', 'Cooper', 'Bo', 'Hoss', 'Dewey',
      'Jasper', 'Wiley', 'Monty', 'Clyde', 'Junior', 'Bucky', 'Rip', 'Boomer', 'Chip', 'Ziggy', 'Mack', 'Bruno', 'Cletus',
      'Elmo', 'Floyd', 'Gordo', 'Huck', 'Luther', 'Mo', 'Nate', 'Pistol', 'Rocky', 'Truck', 'Tucker', 'Bronko', 'Deacon'],
    first: ['Marcus', 'Jaylen', 'Tyrese', 'Darius', 'Kevin', 'Chris', 'Malik', 'Trey', 'Jordan', 'Isaiah', 'Cameron', 'Brandon', 'Tony',
      'Terrence', 'Dante', 'Reggie', 'Andre', 'Kofi', 'Mateo', 'Nico', 'Jamal', 'Quentin', 'Rasheed', 'Elijah', 'Omar', 'Byron', 'Felix',
      'Gus', 'Hank', 'Ike', 'Lonnie', 'Moses', 'Otis', 'Percy', 'Rufus', 'Silas', 'Vernon', 'Wendell', 'Zeke', 'Ty', 'Deshawn', 'Luis',
      'Cole', 'Brady', 'Tate', 'Garrett', 'Javon', 'Kyler', 'Logan', 'Micah', 'Reid', 'Sam'],
    last: ['Jones', 'Thompson', 'Washington', 'Carter', 'Brooks', 'Okafor', 'Jenkins', 'Reyes', 'Fischer', 'Nguyen', 'Patel', 'Murphy',
      'Coleman', 'Hayes', 'Bishop', 'Price', 'Stone', 'Banks', 'Woods', 'Fox', 'Ward', 'Mercer', 'Holloway', 'McGee', 'Bonner', 'Hollis',
      'Duckett', 'Pemberton', 'Butterworth', 'Barnes', 'Crawford', 'Dawson', 'Ellison', 'Gaines', 'Hardaway', 'Ingram', 'Kendrick',
      'Langford', 'McBride', 'Odom', 'Pruitt', 'Quarles', 'Rollins', 'Sutton', 'Tolliver', 'Underwood', 'Vance', 'Whitfield', 'Kowalski',
      'Brennan', 'Lockett', 'Mahoney', 'Steele', 'Yates'],
    nick: ['Big', 'Little', 'Sweet', 'Old Man', 'Baby', 'Sir', 'Uncle', 'Professor', 'Smooth', 'Silent', 'Captain', 'Mean', 'Prime', 'Hurricane'],
  },

  /* AI teams: 7 are drawn for the league */
  teams: ['Portland Pancakes', 'Boston Baked Beans', 'Denver Yetis', 'Miami Flamingos', 'Seattle Sasquatch', 'Austin Armadillos',
    'Chicago Hot Dogs', 'Phoenix Scorpions', 'Detroit Gearheads', 'Nashville Hound Dogs', 'Buffalo Snowplows', 'Tulsa Tornadoes',
    'Tampa Gators', 'Las Vegas Jackpots', 'Milwaukee Cheeseheads', 'Kansas City Barbecue', 'San Diego Surfers', 'Anchorage Moose',
    'Baltimore Crabcakes', 'Pittsburgh Pierogies', 'Boise Spuds', 'Albany Alley Cats', 'Omaha Steaks', 'Memphis Blues'],
  teamColors: ['#c8332f', '#2a8a47', '#7a3db8', '#e08a1e', '#0f8b8d', '#b8901c', '#26262b', '#d6528f', '#7a4a2a', '#2c3e94', '#7f9e2f', '#16a3c4'],

  /* Your team colors (free to switch) */
  colors: [
    { id: 'blue',   name: 'Royal blue',   hex: '#3f4be0' },
    { id: 'red',    name: 'Crimson',      hex: '#b3202a' },
    { id: 'green',  name: 'Forest green', hex: '#1f6b3a' },
    { id: 'orange', name: 'Blaze orange', hex: '#ea6a1f' },
    { id: 'purple', name: 'Purple',       hex: '#5b2a8f' },
    { id: 'navy',   name: 'Navy',         hex: '#1b2a52' },
    { id: 'gold',   name: 'Gold',         hex: '#d4a017' },
    { id: 'teal',   name: 'Teal',         hex: '#0f8b8d' },
  ],
};
