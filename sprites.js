// Pixel-art sprites for fish species in the bass lake. Top-down view, head right.
// Each species has a palette (single ASCII chars -> hex colors, '.' = transparent)
// and 3 animation frames showing tail wiggle: bent left, centered, bent right.
const SPRITES = {
  // ---------------------------------------------------------------------------
  // BLUEGILL — 26 wide x 12 tall. Round olive panfish with dark "ear" flaps,
  // faint vertical bars, orange belly hint, dark spine stripe.
  // ---------------------------------------------------------------------------
  bluegill: {
    palette: {
      '.': null,
      'a': '#3d5a35', // dark olive (back/spine)
      'b': '#5a7d48', // mid olive (body)
      'c': '#7a9a5e', // light olive (sides)
      'd': '#2a3d24', // very dark olive (tail edge, bars)
      'e': '#1a1f3d', // dark blue-black (ear flap)
      'f': '#d97a2b', // orange (belly hint)
      'g': '#0a0a0a', // black (eye)
      'h': '#4a6b3c', // tail mid
    },
    frames: [
      // Frame 1: tail bent LEFT (head right, tail curls down-left)
      [
        '......dd..bbbbbbb.........',
        '....dhhh.bbcccccbb........',
        '..dhhhhbbccaaaccbbb.......',
        '.dhhhdbcaaaaaaaccbbbg.....',
        'dhhhdbcaaaeaaaeaccbbgg....',
        'hhhdbcaaaaaaaaaaaccbbg....',
        'hhhdbcaaaeaaaeaaaccbbg....',
        'dhhhdbcaaaaaaaaaccbbgg....',
        '.dhhhdbcaaaaaaaccbbbg.....',
        '..dhhhhbbccaaaccbbb.......',
        '....dfff.bbcccccbb........',
        '......ff..fbbbbbf.........',
      ],
      // Frame 2: tail CENTERED (body straight)
      [
        '........bbbbbbb...........',
        '......dbbcccccbb..........',
        '....dhhbccaaaccbbb........',
        '..dhhhhbcaaaaaaccbbg......',
        '.dhhhhdbcaaeaaeaccbbg.....',
        'dhhhhhdbcaaaaaaaaccbbg....',
        'dhhhhhdbcaaeaaeaaccbbg....',
        '.dhhhhdbcaaaaaaaccbbg.....',
        '..dhhhhbcaaaaaaccbbg......',
        '....dhhbccaaaccbbb........',
        '......dfbbcccccbb.........',
        '........fbbbbbf...........',
      ],
      // Frame 3: tail bent RIGHT (head left wiggle? no — head still right; rear curls)
      // Body shifted left, tail extends rightward at bottom
      [
        '..bbbbbbb.................',
        '.bbcccccbb................',
        'bbbccaaaccbb..............',
        'bbccaaaaaaccbbg...........',
        'bbcaaaeaaaeaccbgg.........',
        'bbcaaaaaaaaaaccbg.........',
        'bbcaaaeaaaeaaaccbg........',
        'bbcaaaaaaaaaaccbgg........',
        'bbbccaaaaaaaccbbg.........',
        'bbbccccaaccccbb...........',
        '.fbbcccccbbb..............',
        '..fbbbbbf.................',
      ],
    ],
  },

  // ---------------------------------------------------------------------------
  // PUMPKINSEED — 26 wide x 12 tall. Brighter olive with orange flecks,
  // red-tipped gill spot, blue cheek lines, orange tail edge.
  // ---------------------------------------------------------------------------
  pumpkinseed: {
    palette: {
      '.': null,
      'a': '#4d7a2e', // bright olive (back)
      'b': '#6a9c3e', // mid bright olive
      'c': '#8bbb52', // light olive (sides)
      'd': '#3a5a22', // dark olive (tail/spine)
      'e': '#e8541b', // bright orange (flecks)
      'r': '#c41e1e', // red (gill spot)
      'u': '#2bb3d4', // turquoise blue (cheek lines)
      'f': '#f59838', // orange tail tinge
      'g': '#0a0a0a', // black (eye)
    },
    frames: [
      // Frame 1: tail bent LEFT
      [
        '......dd..bbbbbbb.........',
        '....dfff.bbcccccbb........',
        '..dffffbbccaeaccbbb.......',
        '.dffffdbcaaaaaaaccrubg....',
        'dffffdbcaeaaaaeaaccrrbgg..',
        'fffddbcaaaaeaaaaaeccrubg..',
        'fffddbcaaeaaaaeaaaccrubg..',
        'dffffdbcaaaaaeaaaccrrbgg..',
        '.dffffdbcaeaaaaaaccrubg...',
        '..dffffbbccaaaaccbbb......',
        '....dfff.bbcccccbb........',
        '......ff..fbbbbbf.........',
      ],
      // Frame 2: tail CENTERED
      [
        '........bbbbbbb...........',
        '......dbbcccccbb..........',
        '....dffbccaeaccbbb........',
        '..dffffbcaaaaaaccrubg.....',
        '.dffffdbcaeaaeaaccrrbgg...',
        'dffffddbcaaaaaaaaccrubg...',
        'dffffddbcaaeaaaeaaccrubg..',
        '.dffffdbcaeaaaaaaccrrbgg..',
        '..dffffbcaaaaeaaccrubg....',
        '....dffbccaaaaccbbb.......',
        '......dfbbcccccbb.........',
        '........fbbbbbf...........',
      ],
      // Frame 3: tail bent RIGHT (body shifted left)
      [
        '..bbbbbbb.................',
        '.bbcccccbb................',
        'bbbccaeaccbb..............',
        'burccaaaaaaccbbg..........',
        'burrccaeaaeaccbgg.........',
        'burccaaaaaaaaccbg.........',
        'burccaaaeaaaeaccbg........',
        'burrccaeaaaaaccbgg........',
        'burccaaaaaaaccbg..........',
        'bbbccaaaaccbbb............',
        '.fbbcccccbbb..............',
        '..fbbbbbf.................',
      ],
    ],
  },

  // ---------------------------------------------------------------------------
  // CRAPPIE — 30 wide x 11 tall. Elongated silvery-grey body with charcoal
  // mottled blotches, large gold-ringed eyes, forked tail.
  // ---------------------------------------------------------------------------
  crappie: {
    palette: {
      '.': null,
      'a': '#7d8a93', // mid silver-grey (back)
      'b': '#a4b0b8', // light silver (sides)
      'c': '#c8d2d8', // pale silver (belly hint)
      'd': '#4a5359', // dark grey (spine/tail edge)
      'm': '#2a2f33', // charcoal blotches
      'y': '#d4a82b', // gold iris ring
      'g': '#0a0a0a', // black pupil
      'h': '#5d6970', // tail mid
    },
    frames: [
      // Frame 1: tail bent LEFT, forked
      [
        '...dd...bbbbbbbbbb............',
        '.dhhh..bbaaaaaaaabb...........',
        'dhhhdbbbaammaadaammbb.........',
        'hhhh.dbamaaaaadaaaammbygg.....',
        'hhh..dbaaammaadaammaaabyygg...',
        'hhhh.dbaaaaaaadaaaaaaabyygg...',
        'hhh..dbaaammaadaammaaabyygg...',
        'hhhh.dbamaaaaadaaaammbygg.....',
        'dhhhdbbbaammaadaammbb.........',
        '.dhhh..bbaaaaaaaabb...........',
        '...dd...bbbbbbbbbb............',
      ],
      // Frame 2: tail CENTERED
      [
        '..........bbbbbbbbbb..........',
        '........dbbaaaaaaaabb.........',
        '......dhhbaammaadaammbb.......',
        '....dhhhhbamaaaaadaaaammbygg..',
        '...dhhhhdbaaammaadaammaaabyygg',
        '...dhhhhdbaaaaaaadaaaaaaabyygg',
        '...dhhhhdbaaammaadaammaaabyygg',
        '....dhhhhbamaaaaadaaaammbygg..',
        '......dhhbaammaadaammbb.......',
        '........dbbaaaaaaaabb.........',
        '..........bbbbbbbbbb..........',
      ],
      // Frame 3: tail bent RIGHT, forked (body shifted left)
      [
        'bbbbbbbbbb...dd...............',
        'bbaaaaaaaabb.hhhd.............',
        'bbaammaadaammbbhhhd...........',
        'bbamaaaaadaaaammbygghhh.......',
        'bbaaammaadaammaaabyyhhhh......',
        'bbaaaaaaadaaaaaaabyyghhh......',
        'bbaaammaadaammaaabyyhhhh......',
        'bbamaaaaadaaaammbygghhh.......',
        'bbaammaadaammbbhhhd...........',
        'bbaaaaaaaabb.hhhd.............',
        'bbbbbbbbbb...dd...............',
      ],
    ],
  },

  // ---------------------------------------------------------------------------
  // LARGEMOUTH BASS — 36 wide x 13 tall. Long torpedo body, dark olive back,
  // signature broken lateral stripe of dark blotches, cream belly, red tail spot.
  // ---------------------------------------------------------------------------
  largemouth_bass: {
    palette: {
      '.': null,
      'a': '#2f4a1f', // very dark olive (back/spine)
      'b': '#4a6a2f', // dark olive (back)
      'c': '#7a9648', // mid olive (sides)
      'd': '#a8bd6e', // light olive (lower sides)
      'e': '#e8e0bc', // cream (belly hint)
      'm': '#1a2810', // black-olive (lateral blotches)
      'r': '#c43222', // red-orange (tail base spot)
      'h': '#3d5524', // tail mid
      'k': '#252f15', // tail edge dark
      'y': '#e8c547', // yellow-cream eye
      'g': '#0a0a0a', // black pupil
    },
    frames: [
      // Frame 1: tail bent LEFT
      [
        '......kk..ccccccccccc...............',
        '....khhh.cccdddddddddcc.............',
        '..khhhhhccdddbbbbbbbbddcc...........',
        '.khhhhdccdbbbaaaaaaaaabbddccyg......',
        'khhhhdcdbbaaaaaaaaaaaaaaabbdcyyg....',
        'khhhdcdbbammaammaammaammaambbcyyg...',
        'hhhdcdbbaaaaaaaaaaaaaaaaaaaabbcyg...',
        'khhhdcdbbammaammaammaammaambbcyyg...',
        'khhhhdcdbbaaaaaaaaaaaaaaaaabbdcyyg..',
        '.khhhhdccdbbbaaaaaaaaabbddccyg......',
        '..khhhhhccdddbbbbbbbbddcc...........',
        '....khhh.cccdddddddddcc.............',
        '......ee..eeeeeeeeeee...............',
      ],
      // Frame 2: tail CENTERED with red base spot
      [
        '..........ccccccccccc...............',
        '........kccccdddddddddcc............',
        '......khhcccdddbbbbbbbbddcc.........',
        '....khhhhrcdbbbaaaaaaaaabbddccyg....',
        '..khhhhhdrcdbbaaaaaaaaaaaaabbdcyyg..',
        '.khhhhhhdrcdbbammaammaammaambbcyyg..',
        'khhhhhhhdrcdbbaaaaaaaaaaaaaaabbcyyg.',
        '.khhhhhhdrcdbbammaammaammaambbcyyg..',
        '..khhhhhdrcdbbaaaaaaaaaaaaabbdcyyg..',
        '....khhhhrcdbbbaaaaaaaaabbddccyg....',
        '......khhcccdddbbbbbbbbddcc.........',
        '........kccccdddddddddcc............',
        '..........eeeeeeeeeee...............',
      ],
      // Frame 3: tail bent RIGHT (body shifted left, tail at bottom-right)
      [
        '..ccccccccccc...kk..................',
        '.cccdddddddddcc.hhhk................',
        'ccdddbbbbbbbbddcchhhhk..............',
        'ddbbbaaaaaaaaabbddccdhhhhk..........',
        'dbbaaaaaaaaaaaaaaabbdcdhhhk.........',
        'dbbammaammaammaammaambbdcdhhhk......',
        'dbbaaaaaaaaaaaaaaaaaaaabbdcdhhhk....',
        'dbbammaammaammaammaambbdcdhhhk......',
        'dbbaaaaaaaaaaaaaaaaabbdcdhhhk.......',
        'ddbbbaaaaaaaaabbddccdhhhhk..........',
        'ccdddbbbbbbbbddcchhhhk..............',
        '.cccdddddddddcc.hhhk................',
        '..eeeeeeeeeee...ee..................',
      ],
    ],
  },
};
