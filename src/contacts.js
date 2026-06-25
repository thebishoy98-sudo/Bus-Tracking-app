import { google } from 'googleapis';
import { getAuthorizedClient } from './google.js';

function titleCase(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b[\p{L}\p{N}]/gu, (m) => m.toUpperCase());
}

export function buildJobContactName({ vehicle, service } = {}) {
  const left = titleCase(vehicle) || 'Customer';
  const right = titleCase(service) || 'Appointment';
  return `${left} - ${right}`;
}

export function buildContactPayload({ phoneNumber, vehicle, service, notes } = {}) {
  const displayName = buildJobContactName({ vehicle, service });
  const bio = [
    service ? `Service: ${service}` : null,
    vehicle ? `Vehicle: ${vehicle}` : null,
    notes ? `Notes: ${notes}` : null,
  ].filter(Boolean).join('\n');

  return {
    names: [{ givenName: displayName }],
    phoneNumbers: phoneNumber ? [{ value: phoneNumber }] : [],
    biographies: bio ? [{ value: bio, contentType: 'TEXT_PLAIN' }] : [],
  };
}

export function peopleClient() {
  return google.people({ version: 'v1', auth: getAuthorizedClient() });
}

export async function upsertJobContact({
  config,
  phoneNumber,
  extraction,
  people = peopleClient(),
} = {}) {
  const payload = buildContactPayload({
    phoneNumber,
    vehicle: extraction?.vehicle,
    service: extraction?.service,
    notes: extraction?.notes,
  });
  const displayName = payload.names[0].givenName;

  if (config?.observationMode) {
    return { observation: true, displayName };
  }

  const res = await people.people.createContact({ requestBody: payload });
  return { observation: false, displayName, resourceName: res.data.resourceName };
}

export default { buildJobContactName, buildContactPayload, upsertJobContact, peopleClient };
