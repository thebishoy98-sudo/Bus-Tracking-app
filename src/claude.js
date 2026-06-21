import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { config as defaultConfig } from './config.js';
import { todayISO, nowReadable } from './time.js';

let sharedClient;
function getClient() {
  if (!sharedClient) sharedClient = new Anthropic({ apiKey: defaultConfig.anthropicApiKey() });
  return sharedClient;
}

// The single tool we force Claude to call, which gives us clean JSON back.
export const APPOINTMENT_TOOL = {
  name: 'record_appointment',
  description:
    'Record the auto-repair appointment details extracted from a customer text message and any attached photos.',
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
          'True only if you have a specific calendar date AND a specific clock time AND a sense of the service. False if the date or time is missing or vague.',
      },
      customer_name: { type: ['string', 'null'], description: 'Customer name if known.' },
      service: {
        type: ['string', 'null'],
        description: 'What is being fixed/serviced on the car, in a few words.',
      },
      vehicle: { type: ['string', 'null'], description: 'Vehicle year/make/model if mentioned.' },
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
      image_observations: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Plain, conservative visual observations of any attached photos (e.g. "rust visible on rotor edge"). ' +
          'These are observations only, NOT a diagnosis and NOT a definitive conclusion about what is wrong. ' +
          'Empty array if there are no images or nothing can be said confidently.',
      },
      uncertainty: {
        type: ['string', 'null'],
        description: 'What you are unsure about in the message or images. Null if nothing notable.',
      },
      suggested_service_categories: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Possible service categories this might fall under (e.g. "brakes", "tires"), as suggestions to a human, not conclusions.',
      },
      clarification_question: {
        type: ['string', 'null'],
        description:
          'If has_enough_info is false, ONE short, specific question to text the shop owner so they can fill the gap. Null otherwise.',
      },
    },
    required: ['is_appointment_request', 'has_enough_info'],
  },
};

function systemPrompt(config) {
  return [
    `You are the scheduling assistant for ${config.shopName}, an auto-repair shop.`,
    `Customers text the shop to book car-repair appointments, sometimes with photos.`,
    `Read each message and any images and extract the appointment using the record_appointment tool.`,
    ``,
    `The current local date and time at the shop is ${nowReadable(config.timezone)} (timezone ${config.timezone}).`,
    `Today's date is ${todayISO(config.timezone)}. Resolve relative dates like "tomorrow" or "next Tuesday"`,
    `against that. Business hours are roughly 8am–6pm, so interpret bare times sensibly (e.g. "3" means 3:00 PM).`,
    ``,
    `For photos: describe only what is plainly visible as conservative observations. Do NOT diagnose,`,
    `do NOT state a definitive cause, and do NOT promise any repair. Surface uncertainty honestly.`,
    ``,
    `Be conservative about scheduling: if the date OR the time is missing or vague, set has_enough_info=false`,
    `and write a short clarification_question for the shop owner. A wrong guess wastes a customer's trip.`,
  ].join('\n');
}

// Build base64 image blocks from validated, retained files. Bounded by config
// and filtered to the allowlisted MIME types.
export function buildImageBlocks(images = [], config = defaultConfig) {
  const allowed = (images || []).filter((img) => config.allowedImageMimes.includes(img.mime));
  const bounded = allowed.slice(0, config.maxImagesPerMessage);
  const blocks = [];
  for (const img of bounded) {
    let data;
    try {
      data = fs.readFileSync(img.filePath).toString('base64');
    } catch {
      continue; // skip unreadable/missing files rather than failing the whole request
    }
    blocks.push({ type: 'image', source: { type: 'base64', media_type: img.mime, data } });
  }
  return blocks;
}

export function buildUserContent(message, images = [], config = defaultConfig, extra = '') {
  const text =
    `New text message to the shop.\n` +
    `From: ${message.from_name || 'Unknown'} (${message.from_number || 'unknown number'})\n` +
    `Message:\n"""${message.body || ''}"""` +
    (images && images.length ? `\n\n(${images.length} photo(s) attached.)` : '') +
    (extra ? `\n\n${extra}` : '');
  return [{ type: 'text', text }, ...buildImageBlocks(images, config)];
}

export function buildExtractionRequest({ message, images = [], config = defaultConfig, content }) {
  return {
    model: config.anthropicModel,
    max_tokens: 1024,
    system: systemPrompt(config),
    tools: [APPOINTMENT_TOOL],
    tool_choice: { type: 'tool', name: 'record_appointment' },
    messages: [{ role: 'user', content: content || buildUserContent(message, images, config) }],
  };
}

async function callTool(request, client) {
  const resp = await (client || getClient()).messages.create(request);
  const block = resp.content.find((b) => b.type === 'tool_use');
  if (!block) throw new Error('Claude did not return structured appointment data.');
  return block.input;
}

// First pass: extract from the customer message and any attached images.
export async function extractAppointment(message, { images = [], config = defaultConfig, client } = {}) {
  return callTool(buildExtractionRequest({ message, images, config }), client);
}

// Second pass: re-extract after the owner answers a clarification question.
export async function extractWithClarification(message, question, answer, { images = [], config = defaultConfig, client } = {}) {
  const extra =
    `The shop owner was asked: "${question}"\n` +
    `The shop owner replied: "${answer}"\n\n` +
    `Use the owner's reply as the source of truth to finalize the appointment.`;
  const content = buildUserContent(message, images, config, extra);
  return callTool(buildExtractionRequest({ message, images, config, content }), client);
}
