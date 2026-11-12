import assert from 'node:assert/strict';
import { isPastDue, parisStartOfDay, parseRangeBound, parseUserDate } from '../src/lib/bot/dates';
import { BotApiError } from '../src/lib/bot/errors';
import { assertSettlementAmount, paymentView } from '../src/lib/bot/payment';
import {
  createClientSchema,
  createDocumentSchema,
  paymentSchema,
  updateClientSchema,
} from '../src/lib/bot/schemas';

function rejects(schema: { safeParse: (data: unknown) => { success: boolean } }, data: unknown) {
  assert.equal(schema.safeParse(data).success, false);
}

const juneNow = new Date('2026-06-15T12:00:00.000Z');
const overdue = paymentView(
  {
    documentType: 'INVOICE',
    status: 'PENDING_PAYMENT',
    balanceDue: 450,
    dueDate: new Date('2026-06-14T21:00:00.000Z'),
    now: juneNow,
  },
  '2026-06-14T21:00:00.000Z',
  null,
);
assert.equal(overdue.status, 'overdue');
assert.equal(overdue.label, 'en retard');
assert.equal(overdue.remainingAmount, 450);

const dueToday = paymentView(
  {
    documentType: 'INVOICE',
    status: 'PENDING_PAYMENT',
    balanceDue: 450,
    dueDate: new Date('2026-06-14T22:00:00.000Z'),
    now: juneNow,
  },
  null,
  null,
);
assert.equal(dueToday.status, 'unpaid');
assert.equal(isPastDue(new Date('2026-06-14T22:00:00.000Z'), juneNow), false);

const paid = paymentView(
  { documentType: 'INVOICE', status: 'PAID', balanceDue: 450, paidAt: juneNow, now: juneNow },
  null,
  juneNow.toISOString(),
);
assert.equal(paid.status, 'paid');
assert.equal(paid.remainingAmount, 0);

const quote = paymentView(
  { documentType: 'QUOTE', status: 'ISSUED', balanceDue: 200, now: juneNow },
  null,
  null,
);
assert.equal(quote.status, 'not_applicable');
assert.equal(quote.remainingAmount, null);

assert.equal(parisStartOfDay('2026-01-15').toISOString(), '2026-01-14T23:00:00.000Z');
assert.equal(parisStartOfDay('2026-06-15').toISOString(), '2026-06-14T22:00:00.000Z');
assert.equal(parseRangeBound('2026-01-15', 'end').toISOString(), '2026-01-15T22:59:59.999Z');
assert.equal(parseUserDate('2026-06-15T10:00:00Z').toISOString(), '2026-06-15T10:00:00.000Z');

assert.throws(() => parseUserDate('15/06/2026'), BotApiError);
assert.throws(() => parseUserDate('2026-02-31'), BotApiError);

assertSettlementAmount(undefined, 120.5);
assertSettlementAmount(120.5, 120.504);
assert.throws(() => assertSettlementAmount(100, 120.5), (error: unknown) => {
  assert.ok(error instanceof BotApiError);
  assert.equal(error.status, 400);
  return true;
});

assert.equal(createClientSchema.safeParse({ name: 'Salle Pleyel', email: 'booker@example.com', siret: '123 456 789 00012' }).success, true);
rejects(createClientSchema, { name: '   ' });
rejects(createClientSchema, { name: 'Salle', email: 'pas-un-email' });
rejects(createClientSchema, { name: 'Salle', siret: '123' });
rejects(createClientSchema, { name: 'Salle', instagramHandle: '@salle' });
rejects(updateClientSchema, {});

assert.equal(createDocumentSchema.safeParse({
  clientName: 'Salle Pleyel',
  lineItems: [{ description: 'DJ set', quantity: 1, unitPrice: 800 }],
}).success, true);
assert.equal(createDocumentSchema.safeParse({ bookingId: 'booking-1' }).success, true);
rejects(createDocumentSchema, { clientName: 'Salle' });
rejects(createDocumentSchema, { clientName: 'Salle', lineItems: [{ description: '', quantity: 1, unitPrice: 10 }] });
rejects(paymentSchema, { amount: -1 });
assert.equal(paymentSchema.safeParse({}).success, true);

console.log('check-bot-api: ok');
