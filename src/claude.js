import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { todayISO, nowReadable } from './time.js';

let client;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey() });
  return client;
}

// The single tool we force Claude to call, which gives us clean JSON back.
const APPOINTMENT_TOOL = {
  name: 'record_appointment',
  description:
    'Record the auto-repair appointment details extracted from a customer text message.',
  input_schema: {
    type: 'object',
    properties: {
      is_appointment_request: {
        type: 'boolean',
        description:
          'True if the message is trying to book, reschedule, or ask about a service appointment. False for spam, wrong numbers, generic questions, etc.',
      },
      has_enough_info: {
        type: 'boolean',
        description:
          'True only if you have a specific calendar date AND a specific clock time AND a sense of the service. False if the date or time is missing or vague (e.g. "sometime next week", "in the afternoon").',
      },
      customer_name: { type: ['string', 'null'], description: 'Customer name if known.' },
      service: {
        type: ['string', 'null'],
        description: 'What is being fixed/serviced on the car, in a few words.',
      },
      vehicle: {
        type: ['string', 'null'],
        description: 'Vehicle year/make/model if mentioned.',
      },
      start_local: {
        type: ['string', 'null'],
        description:
          'Appointment start as a naive local datetime "YYYY-MM-DDTHH:MM:SS" in the shop timezone. No timezone offset. Null if unknown.',
      },
      duration_minutes: {
        type: ['integer', 'null'],
        description: 'Estimated duration in minutes if the customer indicated one, else null.',
      },
      notes: { type: ['string', 'null'], description: 'Any other useful detail.' },
      clarification_question: {
        type: ['string', 'null'],
        description:
          'If has_enough_info is false, ONE short, specific question to text the shop owner so they can fill the gap (e.g. "Mara wants brakes done next week but gave no day/time — what should I book?"). Null otherwise.',
      },
    },
    required: ['is_appointment_request', 'has_enough_info'],
  },
};

function systemPrompt() {
  return [
    `You are the scheduling assistant for ${config.shopName}, an auto-repair shop.`,
    `Customers text the shop to book car-repair appointments. Read each message and`,
    `extract the appointment using the record_appointment tool.`,
    ``,
    `The current local date and time at the shop is ${nowReadable()} (timezone ${config.timezone}).`,
    `Today's date is ${todayISO()}. Resolve relative dates like "tomorrow", "next Tuesday",`,
    `or "this Friday" against that. Business hours are roughly 8am–6pm, so interpret bare`,
    `times sensibly (e.g. "3" means 3:00 PM).`,
    ``,
    `Be conservative: if the date OR the time is missing or vague, set has_enough_info=false`,
    `and write a short clarification_question for the shop owner. A wrong guess wastes a`,
    `customer's trip, so prefer to ask. Output start_local only when you are confident.`,
  ].join('\n');
}

async function callTool(userContent) {
  const resp = await getClient().messages.create({
    model: config.anthropicModel,
    max_tokens: 1024,
    system: systemPrompt(),
    tools: [APPOINTMENT_TOOL],
    tool_choice: { type: 'tool', name: 'record_appointment' },
    messages: [{ role: 'user', content: userContent }],
  });
  const block = resp.content.find((b) => b.type === 'tool_use');
  if (!block) throw new Error('Claude did not return structured appointment data.');
  return block.input;
}

// First pass: extract from the raw customer message.
export async function extractAppointment(message) {
  const userContent =
    `New text message to the shop.\n` +
    `From: ${message.from_name || 'Unknown'} (${message.from_number || 'unknown number'})\n` +
    `Message:\n"""${message.body || ''}"""`;
  return callTool(userContent);
}

// Second pass: re-extract after the owner answers a clarification question.
export async function extractWithClarification(message, question, answer) {
  const userContent =
    `New text message to the shop.\n` +
    `From: ${message.from_name || 'Unknown'} (${message.from_number || 'unknown number'})\n` +
    `Original message:\n"""${message.body || ''}"""\n\n` +
    `The shop owner was asked: "${question}"\n` +
    `The shop owner replied: "${answer}"\n\n` +
    `Use the owner's reply as the source of truth to finalize the appointment.`;
  return callTool(userContent);
}
