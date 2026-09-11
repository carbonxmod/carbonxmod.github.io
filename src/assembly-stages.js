// Shared by the 3D renderer and the scroll player. Times mark stage starts,
// not the convenient mid-stage positions used by the jump buttons.
export const stages = [
    [0, 'start with the brace', 'One brace holds twelve keys.'],
    [0.1, 'seat the key', 'The key fits into its slot in the brace.'],
    [0.24, 'slide in the wire', 'A 1.1 mm steel wire holds the key in place.'],
    [0.32, 'fit the buttons', 'Two buttons snap onto the same key.'],
    [0.46, 'one octave', 'Six long keys and six short keys share a brace.'],
    [
        0.66,
        '4 octaves',
        'Four octaves, or possibly more. Twelve keys per brace.',
    ],
]
