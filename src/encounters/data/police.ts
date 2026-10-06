import type { EncounterDef } from '../types'

export const police: EncounterDef = {
  id: 'police',
  speaker: 'Officer',
  lines: ['Oga! Why you dey run like this?', 'Wetin happen?'],
  minDistance: 200,
  choices: [
    {
      label: '"Officer, abeg assist me." (₦500)',
      cost: 500,
      outcomes: [
        {
          weight: 1,
          effects: [
            { kind: 'money', amount: -500 },
            { kind: 'policeAssist', seconds: 8 },
            { kind: 'revealTurn' },
            { kind: 'bark', speaker: 'Officer', line: 'Oya enter! We go catch am!' },
          ],
        },
      ],
    },
    {
      label: '"Abeg help me, I no get money."',
      outcomes: [
        {
          weight: 0.5,
          effects: [
            { kind: 'revealTurn' },
            { kind: 'bark', speaker: 'Officer', line: 'Him follow that side. Run!' },
          ],
        },
        {
          weight: 0.5,
          effects: [
            { kind: 'bark', speaker: 'Officer', line: 'No money? Oya, continue your exercise.' },
          ],
        },
      ],
    },
    {
      label: 'Keep running',
      outcomes: [
        {
          weight: 1,
          effects: [{ kind: 'bark', speaker: 'Officer', line: 'Hmm. This one na runner.' }],
        },
      ],
    },
  ],
}
