// Pixel-art sprites for fish species in the bass lake. Top-down view, head right.
// Each species has a palette (single ASCII chars -> hex colors, '.' = transparent)
// and 3 animation frames showing tail wiggle: bent left, centered, bent right.
const SPRITES = {
  // ---------------------------------------------------------------------------
  // BLUEGILL — 28 wide x 14 tall. Round olive sunfish with dark "ear flap" spot
  // behind each eye, faint vertical bars across back, orange belly hint.
  // ---------------------------------------------------------------------------
  bluegill: {
    palette: {
      '.': null,
      'a': '#3d5a35', // dark olive (back centerline / dorsal ridge)
      'b': '#5a7d48', // mid olive (back)
      'c': '#7a9a5e', // light olive (sides)
      'd': '#2a3d24', // very dark olive (faint vertical bars)
      'e': '#0d1230', // dark blue-black (ear flap / operculum spot)
      'f': '#d97a2b', // orange (belly hint)
      'h': '#4a6b3c', // tail mid-tone
      'k': '#243017', // tail dark edge
      'p': '#9bb872', // pale olive (pectoral fins)
      'g': '#0a0a0a', // black (eye / pupil)
    },
    frames: [
      // Frame 1: tail bent DOWN-LEFT (rear of body curves up slightly)
      [
        '.....kk....bbbbbbbbb........',
        '...khhk...bbcccccccbb.......',
        '..khhh...bbcccbabaccbb......',
        '.khhhk..bccdcbababacdcbpg...',
        'khhhk..bcceabababababecbpgg.',
        'hhhk..bcceabababababaecbpg..',
        'hhh...bccdababababababcdcbg.',
        'hhh...bccdababababababcdcbg.',
        'hhhk..bcceabababababaecbpg..',
        'khhhk..bcceabababababecbpgg.',
        '.khhhk..bccdcbababacdcbpg...',
        '..khhh...bbcccbabaccbb......',
        '...kfff...ffcccccccff.......',
        '.....ff....fffbbbfff........',
      ],
      // Frame 2: tail CENTERED (body straight)
      [
        '........bbbbbbbbb...........',
        '......kbbcccccccbb..........',
        '....khhbcccbabaccbb.........',
        '..khhhhbccdcbababacdcbpg....',
        '.khhhhkbcceababababaecbpgg..',
        'khhhhhkbceabababababaecbpg..',
        'hhhhhhkbcdababababababcdcbg.',
        'hhhhhhkbcdababababababcdcbg.',
        'khhhhhkbceabababababaecbpg..',
        '.khhhhkbcceababababaecbpgg..',
        '..khhhhbccdcbababacdcbpg....',
        '....khhbcccbabaccbb.........',
        '......kfbbcccccccbb.........',
        '........fffbbbfff...........',
      ],
      // Frame 3: tail bent DOWN-RIGHT relative... body shifted left, tail up-right
      [
        '...bbbbbbbbb....kk..........',
        '..bbcccccccbb..khhk.........',
        '.bbcccbabaccbb.hhhk.........',
        'bccdcbababacdcbphhhk........',
        'bcceabababababecbphhhk......',
        'bcceabababababaecbphhk......',
        'bccdababababababcdcbphhk....',
        'bccdababababababcdcbphhk....',
        'bcceabababababaecbphhk......',
        'bcceabababababecbphhhk......',
        'bccdcbababacdcbphhhk........',
        '.bbcccbabaccbb.hhhk.........',
        '..ffcccccccff..fff..........',
        '...fffbbbfff...ff...........',
      ],
    ],
  },

  // ---------------------------------------------------------------------------
  // PUMPKINSEED — 28 wide x 14 tall. Olive sunfish covered in orange/red flecks,
  // red gill spot at operculum tip, wavy turquoise cheek lines, yellow belly hint.
  // ---------------------------------------------------------------------------
  pumpkinseed: {
    palette: {
      '.': null,
      'a': '#4d7a2e', // mid olive (back centerline)
      'b': '#6a9c3e', // bright olive (back)
      'c': '#8bbb52', // light olive (sides)
      'd': '#3a5a22', // dark olive (back accents)
      'e': '#d97a2b', // orange flecks
      'r': '#c43a3a', // red gill spot
      'u': '#5cd0e0', // turquoise cheek line
      'v': '#3aa0c0', // deeper turquoise
      'f': '#f5b03a', // yellow-orange belly hint
      'h': '#3d5524', // tail mid
      'k': '#243017', // tail dark edge
      'p': '#9bcc62', // pale olive (pectoral fins)
      'g': '#0a0a0a', // black eye
    },
    frames: [
      // Frame 1: tail bent down-left
      [
        '.....kk....bbbbbbbbb........',
        '...khhk...bbcececeebb.......',
        '..khhh...bbcaeaeaeaccbb.....',
        '.khhhk..bcdaecaeaeaaervbg...',
        'khhhk..bcaeaeacaeaeaervrbgg.',
        'hhhk..bcaecaeaeaeaeauvrbg...',
        'hhh...bcaeaeaeaeaeaeuvrbg...',
        'hhh...bcaeaeaeaeaeauvrbgg...',
        'hhhk..bcaecaeaeaeaeaervbg...',
        'khhhk..bcaeaeacaeaeaervrbg..',
        '.khhhk..bcdaecaeaeaaervbg...',
        '..khhh...bbcaeaeaeaccbb.....',
        '...kfef...bbceceffeebb......',
        '.....ff....ffbbbbbff........',
      ],
      // Frame 2: tail centered
      [
        '........bbbbbbbbb...........',
        '......kbbcececeebb..........',
        '....khhbcaeaeaeaccbb........',
        '..khhhhbcdaecaeaaaervbg.....',
        '.khhhhkbcaeaeacaeaeaervrbg..',
        'khhhhhkbcaecaeaeaeaeauvrbg..',
        'hhhhhhkbcaeaeaeaeaeaeuvrbgg.',
        'hhhhhhkbcaeaeaeaeaeaeuvrbgg.',
        'khhhhhkbcaecaeaeaeaeauvrbg..',
        '.khhhhkbcaeaeacaeaeaervrbg..',
        '..khhhhbcdaecaeaeaaervbg....',
        '....khhbcaeaeaeaccbb........',
        '......kfbbceceffeebb........',
        '........ffbbbbbff...........',
      ],
      // Frame 3: tail bent right (body shifted left)
      [
        '...bbbbbbbbb....kk..........',
        '..bbcececeebb..khhk.........',
        '.bbcaeaeaeaccbb.hhhk........',
        'bcdaecaeaeaaervbphhhk.......',
        'bcaeaeacaeaeaervrbphhhk.....',
        'bcaecaeaeaeaeauvrbphhk......',
        'bcaeaeaeaeaeaeuvrbpphhk.....',
        'bcaeaeaeaeaeaeuvrbpphhk.....',
        'bcaecaeaeaeaeauvrbphhk......',
        'bcaeaeacaeaeaervrbphhhk.....',
        'bcdaecaeaeaaervbphhhk.......',
        '.bbcaeaeaeaccbb.hhhk........',
        '..ffceceffeebb..fff.........',
        '...ffbbbbbff....ff..........',
      ],
    ],
  },

  // ---------------------------------------------------------------------------
  // CRAPPIE (black) — 32 wide x 12 tall. Elongated silvery-grey body with dense
  // irregular charcoal mottled blotches, large gold-ringed eyes, long dorsal ridge.
  // ---------------------------------------------------------------------------
  crappie: {
    palette: {
      '.': null,
      'a': '#7d8a93', // mid silver-grey (back)
      'b': '#a4b0b8', // light silver (sides)
      'c': '#c8d2d8', // pale silver (lower edge)
      'd': '#4a5359', // dark grey (dorsal ridge / spine)
      'm': '#262a2e', // charcoal blotches
      'n': '#3a4046', // softer charcoal blotches
      's': '#dde5ea', // silver speckle (fin edges)
      'y': '#e8c93a', // gold iris ring
      'g': '#0a0a0a', // black pupil
      'h': '#5d6970', // tail mid
      'k': '#2a3036', // tail dark edge
    },
    frames: [
      // Frame 1: tail bent down-left, forked
      [
        '....kk.....bbbbbbbbbbbbb........',
        '..khhh....bbcaammnaaammnabbs....',
        '.khhhk....bbammaadaammaamabysg..',
        'khhh.....bbamnaadaaamnaaambyygg.',
        'hhh.....bbammaaadaaammaammabyyg.',
        'hhh.....bbaaaaaadaaaaaaaaaabyyg.',
        'hhh.....bbammaaadaaammaammabyyg.',
        'hhh.....bbamnaadaaamnaaambyygg..',
        'khhh.....bbammaadaammaamabysg...',
        '.khhhk....bbcaammnaaammnabbs....',
        '..khhh....bbbbbbbbbbbbb.........',
        '....kk.....cccccccccccc.........',
      ],
      // Frame 2: tail centered, forked
      [
        '..........bbbbbbbbbbbbb.........',
        '........kbbcaammnaaammnabbs.....',
        '......khhbbammaadaammaamabysg...',
        '....khhhhbamnaadaaamnaaambyygg..',
        '...khhhhkbammaaadaaammaammabyyg.',
        'kkhhhhhhkbaaaaaadaaaaaaaaaabyyg.',
        '...khhhhkbammaaadaaammaammabyyg.',
        '....khhhhbamnaadaaamnaaambyygg..',
        '......khhbbammaadaammaamabysg...',
        '........kbbcaammnaaammnabbs.....',
        '..........bbbbbbbbbbbbb.........',
        '..........cccccccccccc..........',
      ],
      // Frame 3: tail bent down-right (body shifted left)
      [
        '..bbbbbbbbbbbbb.....kk..........',
        '.bbcaammnaaammnabbs.hhhk........',
        'bbammaadaammaamabysg.hhhk.......',
        'bamnaadaaamnaaambyygg.hhhk......',
        'bammaaadaaammaammabyygkhhhhk....',
        'baaaaaadaaaaaaaaaabyygkhhhhhk...',
        'bammaaadaaammaammabyygkhhhhk....',
        'bamnaadaaamnaaambyygg.hhhk......',
        'bbammaadaammaamabysg.hhhk.......',
        '.bbcaammnaaammnabbs.hhhk........',
        '..bbbbbbbbbbbbb.....kk..........',
        '..cccccccccccc..................',
      ],
    ],
  },

  // ---------------------------------------------------------------------------
  // LARGEMOUTH BASS — 38 wide x 14 tall. Long torpedo body, dark olive back,
  // signature broken black lateral stripe (one each side), cream belly, big mouth.
  // ---------------------------------------------------------------------------
  largemouth_bass: {
    palette: {
      '.': null,
      'a': '#2f4a1f', // very dark olive (dorsal centerline)
      'b': '#4a6a2f', // dark olive (back)
      'c': '#7a9648', // mid olive (upper sides)
      'd': '#a8bd6e', // light olive (lower sides)
      'e': '#e8e0bc', // cream (belly hint)
      'm': '#10180a', // black (lateral stripe blotches)
      'n': '#2a3818', // dark olive scale dots
      'h': '#3d5524', // tail mid
      'k': '#1a240e', // tail dark edge
      'j': '#5a7a32', // jaw line
      'y': '#e8c547', // yellow-cream iris
      'g': '#0a0a0a', // black pupil / mouth line
    },
    frames: [
      // Frame 1: tail bent down-left (body s-curves up-right)
      [
        '.....kk......cccccccccccccccc.........',
        '...khhhk.....cdddbbbbbbbbbbddccg......',
        '..khhhhk....cdbbbnaanaanaanabbddcyg...',
        '.khhhk.....cdbbammmmmmmmmmmambbcdyyg..',
        'khhhk.....cdbbananananananananbbdcyyg.',
        'hhhk.....cdbbammmmmmmmmmmmmmambbcdyyjg',
        'hhh......cdbbananaaanaanaaananbbdcyyjg',
        'hhh......cdbbammmmmmmmmmmmmmambbcdyyjg',
        'khhhk.....cdbbananananananananbbdcyyg.',
        '.khhhk.....cdbbammmmmmmmmmmambbcdyyg..',
        '..khhhhk....cdbbbnaanaanaanabbddcyg...',
        '...khhhk.....cdddbbbbbbbbbbddccg......',
        '.....kk......eeeeeeeeeeeeeeee.........',
        '..............eeeeeeeeeeee............',
      ],
      // Frame 2: tail centered, straight torpedo body
      [
        '..........cccccccccccccccc............',
        '........kccdddbbbbbbbbbbddccg.........',
        '......khhccdbbbnaanaanaanabbddcyg.....',
        '....khhhhcdbbammmmmmmmmmmambbcdyyg....',
        '..khhhhhkcdbbananananananananbbdcyyg..',
        '.khhhhhhkcdbbammmmmmmmmmmmmmambbcdyyjg',
        'khhhhhhhkcdbbananaaanaanaaananbbdcyyjg',
        '.khhhhhhkcdbbammmmmmmmmmmmmmambbcdyyjg',
        '..khhhhhkcdbbananananananananbbdcyyg..',
        '....khhhhcdbbammmmmmmmmmmambbcdyyg....',
        '......khhccdbbbnaanaanaanabbddcyg.....',
        '........kccdddbbbbbbbbbbddccg.........',
        '..........eeeeeeeeeeeeeeee............',
        '............eeeeeeeeeeee..............',
      ],
      // Frame 3: tail bent down-right, body shifted left
      [
        '...cccccccccccccccc......kk...........',
        '..cdddbbbbbbbbbbddccg..khhhk..........',
        '.cdbbbnaanaanaanabbddcykhhhhk.........',
        'cdbbammmmmmmmmmmambbcdyyhhhhk.........',
        'cdbbananananananananbbdcyyhhhk........',
        'cdbbammmmmmmmmmmmmmambbcdyyhhk........',
        'cdbbananaaanaanaaananbbdcyyjghhhk.....',
        'cdbbammmmmmmmmmmmmmambbcdyyjg.hhhk....',
        'cdbbananananananananbbdcyyhhhk........',
        'cdbbammmmmmmmmmmambbcdyyhhhhk.........',
        '.cdbbbnaanaanaanabbddcykhhhhk.........',
        '..cdddbbbbbbbbbbddccg..khhhk..........',
        '...eeeeeeeeeeeeeeee......ee...........',
        '....eeeeeeeeeeee......................',
      ],
    ],
  },
};
