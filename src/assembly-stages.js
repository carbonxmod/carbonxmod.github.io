// Shared by the 3D renderer and the scroll player. Times mark stage starts,
// not the convenient mid-stage positions used by the jump buttons.
export const stages = [
    [0, 'brace', 'One brace holds twelve keys.'],
    [0.1, 'key', 'The key fits into its slot in the brace.'],
    [0.24, 'wire', 'A steel wire holds the key in place.'],
    [0.32, 'buttons', 'Two buttons snap onto the same key.'],
    [0.46, 'octave', 'Six long keys and six short keys share a brace.'],
    [
        0.66,
        'keybed',
        'Four octaves laid out one after another, with room for more.',
    ],
    [
        1,
        'remove',
        'Take apart the housing, then remove the original keybed.',
    ],
    [
        1.32,
        'install',
        'Install the new keybed, then put the housing back together.',
    ],
].map(([start, title, description]) => [start / 1.5, title, description])
