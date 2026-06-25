import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJobContactName,
  buildContactPayload,
  upsertJobContact,
} from '../src/contacts.js';

test('buildJobContactName names contacts from vehicle and service', () => {
  assert.equal(
    buildJobContactName({ vehicle: 'Toyota Highlander', service: 'motor mounts' }),
    'Toyota Highlander - Motor Mounts',
  );
  assert.equal(
    buildJobContactName({ vehicle: '2015 Dodge Journey', service: 'synthetic oil change' }),
    '2015 Dodge Journey - Synthetic Oil Change',
  );
});

test('buildJobContactName has useful fallbacks', () => {
  assert.equal(buildJobContactName({ vehicle: 'Toyota Highlander' }), 'Toyota Highlander - Appointment');
  assert.equal(buildJobContactName({ service: 'brakes' }), 'Customer - Brakes');
  assert.equal(buildJobContactName({}), 'Customer - Appointment');
});

test('buildContactPayload stores phone and job context', () => {
  const payload = buildContactPayload({
    phoneNumber: '7328228376',
    vehicle: 'Toyota Highlander',
    service: 'motor mounts',
    notes: 'front mount',
  });

  assert.equal(payload.names[0].givenName, 'Toyota Highlander - Motor Mounts');
  assert.equal(payload.phoneNumbers[0].value, '7328228376');
  assert.match(payload.biographies[0].value, /Service: motor mounts/);
  assert.match(payload.biographies[0].value, /Vehicle: Toyota Highlander/);
  assert.match(payload.biographies[0].value, /front mount/);
});

test('upsertJobContact skips People API writes in observation mode', async () => {
  let called = false;
  const result = await upsertJobContact({
    config: { observationMode: true },
    phoneNumber: '7328228376',
    extraction: { vehicle: 'Toyota Highlander', service: 'motor mounts' },
    people: { people: { createContact: async () => { called = true; } } },
  });

  assert.equal(called, false);
  assert.equal(result.observation, true);
  assert.equal(result.displayName, 'Toyota Highlander - Motor Mounts');
});

test('upsertJobContact creates a contact when not in observation mode', async () => {
  let request;
  const result = await upsertJobContact({
    config: { observationMode: false },
    phoneNumber: '7328228376',
    extraction: { vehicle: 'Toyota Highlander', service: 'motor mounts' },
    people: {
      people: {
        createContact: async (req) => {
          request = req;
          return { data: { resourceName: 'people/c123' } };
        },
      },
    },
  });

  assert.equal(request.requestBody.names[0].givenName, 'Toyota Highlander - Motor Mounts');
  assert.equal(request.requestBody.phoneNumbers[0].value, '7328228376');
  assert.equal(result.resourceName, 'people/c123');
});
