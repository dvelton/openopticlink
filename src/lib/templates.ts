import type { MessageKind } from './protocol';

export interface MessageTemplate {
  id: string;
  label: string;
  kind: MessageKind;
  body: string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'ok',
    label: 'All OK',
    kind: 'status',
    body: 'All OK. No help needed.',
  },
  {
    id: 'help',
    label: 'Need Help',
    kind: 'status',
    body: 'Need help. Please acknowledge if received.',
  },
  {
    id: 'medical',
    label: 'Medical',
    kind: 'status',
    body: 'Medical issue. Need assistance as soon as possible.',
  },
  {
    id: 'meet',
    label: 'Meet Here',
    kind: 'location',
    body: 'Meet at my current location. Reply when you see this.',
  },
  {
    id: 'delayed',
    label: 'Delayed',
    kind: 'status',
    body: 'Delayed but safe. Continue with the plan.',
  },
];
