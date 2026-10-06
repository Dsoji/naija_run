import type { EncounterDef } from '../types'

export const nero: EncounterDef = {
  id: 'nero',
  speaker: 'Nero',
  lines: ['Guy! You still dey chase this motor?', 'I know one corner wey go bring you out front.'],
  minDistance: 300,
  choices: [
    {
      label: '"Show me the shortcut." (₦300)',
      cost: 300,
      outcomes: [
        {
          weight: 0.85,
          effects: [
            { kind: 'money', amount: -300 },
            { kind: 'shortcut', branch: 'MARKET' },
            { kind: 'bark', speaker: 'Nero', line: 'Follow me! Market road. No dull!' },
          ],
        },
        {
          weight: 0.15,
          effects: [
            { kind: 'money', amount: -300 },
            { kind: 'fakeTurn' },
            { kind: 'bark', speaker: 'Nero', line: 'Ehen... I fit don confuse road small.' },
          ],
        },
      ],
    },
    {
      label: '"Abeg just tell me where he go."',
      outcomes: [
        {
          weight: 0.6,
          effects: [
            { kind: 'revealTurn' },
            {
              kind: 'bark',
              speaker: 'Nero',
              line: 'Left or right... e get as e be. Okay fine, that side!',
            },
          ],
        },
        {
          weight: 0.4,
          effects: [{ kind: 'bark', speaker: 'Nero', line: 'Free information no dey Lagos, my guy.' }],
        },
      ],
    },
    {
      label: 'Ignore him',
      outcomes: [
        { weight: 1, effects: [{ kind: 'bark', speaker: 'Nero', line: 'Your loss o!' }] },
      ],
    },
  ],
}
