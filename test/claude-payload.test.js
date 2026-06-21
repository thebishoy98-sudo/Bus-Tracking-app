import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  APPOINTMENT_TOOL,
  buildImageBlocks,
  buildUserContent,
  buildExtractionRequest,
  extractAppointment,
} from '../src/claude.js';

const config = {
  anthropicModel: 'claude-test',
  shopName: 'Test Auto',
  timezone: 'America/New_York',
  allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  maxImagesPerMessage: 2,
};

function tmpImage(name, bytes = 'fakeimg') {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gv-img-')), name);
  fs.writeFileSync(p, Buffer.from(bytes));
  return p;
}

const message = { from_name: 'Mara', from_number: '9085551212', body: 'brakes squealing' };

test('the tool schema captures conservative observations, not diagnoses', () => {
  const props = APPOINTMENT_TOOL.input_schema.properties;
  assert.ok(props.image_observations, 'has image_observations');
  assert.ok(props.uncertainty, 'has uncertainty');
  assert.ok(props.suggested_service_categories, 'has suggested_service_categories');
  // The description must steer away from definitive diagnoses.
  const blob = JSON.stringify(APPOINTMENT_TOOL).toLowerCase();
  assert.match(blob, /observ/);
  assert.match(blob, /not a (diagnosis|definitive)/);
});

test('zero images produces a single text block', () => {
  const content = buildUserContent(message, [], config);
  assert.equal(content.filter((b) => b.type === 'image').length, 0);
  assert.equal(content.filter((b) => b.type === 'text').length, 1);
});

test('one validated image produces one base64 image block', () => {
  const img = tmpImage('a.jpg');
  const blocks = buildImageBlocks([{ filePath: img, mime: 'image/jpeg' }], config);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'image');
  assert.equal(blocks[0].source.type, 'base64');
  assert.equal(blocks[0].source.media_type, 'image/jpeg');
  assert.equal(blocks[0].source.data, Buffer.from('fakeimg').toString('base64'));
});

test('image count is bounded by config.maxImagesPerMessage', () => {
  const imgs = [
    { filePath: tmpImage('a.jpg'), mime: 'image/jpeg' },
    { filePath: tmpImage('b.png'), mime: 'image/png' },
    { filePath: tmpImage('c.gif'), mime: 'image/gif' },
  ];
  const blocks = buildImageBlocks(imgs, config);
  assert.equal(blocks.length, 2);
});

test('disallowed mime types are excluded from image blocks', () => {
  const blocks = buildImageBlocks([
    { filePath: tmpImage('a.jpg'), mime: 'image/jpeg' },
    { filePath: tmpImage('x.zip'), mime: 'application/zip' },
  ], config);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].source.media_type, 'image/jpeg');
});

test('buildExtractionRequest forces the record_appointment tool and includes images', () => {
  const img = tmpImage('a.jpg');
  const req = buildExtractionRequest({ message, images: [{ filePath: img, mime: 'image/jpeg' }], config });
  assert.equal(req.model, 'claude-test');
  assert.equal(req.tool_choice.name, 'record_appointment');
  assert.ok(Array.isArray(req.tools));
  const content = req.messages[0].content;
  assert.equal(content.filter((b) => b.type === 'image').length, 1);
});

test('extractAppointment returns the tool input from an injected client', async () => {
  let received;
  const client = {
    messages: {
      create: async (req) => {
        received = req;
        return { content: [{ type: 'tool_use', name: 'record_appointment', input: { is_appointment_request: true, has_enough_info: false } }] };
      },
    },
  };
  const out = await extractAppointment(message, { images: [], config, client });
  assert.equal(out.is_appointment_request, true);
  assert.equal(received.tool_choice.name, 'record_appointment');
});
