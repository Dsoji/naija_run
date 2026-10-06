import type { EncounterDef } from '../types'

export const agbero: EncounterDef = {
  id: 'agbero',
  speaker: 'Agbero',
  lines: ['You dey find who? Settle me first.'],
  minDistance: 100,
  choices: [
    {
      label: '"Wetin you see?" (₦200)',
      cost: 200,
      outcomes: [
        {
          weight: 0.7,
          effects: [
            { kind: 'money', amount: -200 },
            { kind: 'revealTurn' },
            { kind: 'chase', amount: 5 },
            { kind: 'bark', speaker: 'Agbero', line: 'Red motor? E pass that side now now.' },
          ],
        },
        {
          weight: 0.3,
          effects: [
            { kind: 'money', amount: -200 },
            { kind: 'fakeTurn' },
            { kind: 'chase', amount: -5 },
            { kind: 'bark', speaker: 'Agbero', line: 'Omo, I no see anybody. I just dey yarn you.' },
          ],
        },
      ],
    },
    {
      label: '"Cover me for road." (₦500)',
      cost: 500,
      outcomes: [
        {
          weight: 1,
          effects: [
            { kind: 'money', amount: -500 },
            { kind: 'protection', seconds: 15 },
            { kind: 'bark', speaker: 'Agbero', line: 'Nobody go touch you for this area.' },
          ],
        },
      ],
    },
    {
      label: 'Refuse',
      outcomes: [
        { weight: 1, effects: [{ kind: 'bark', speaker: 'Agbero', line: 'Oya na. You go see.' }] },
      ],
    },
  ],
}
