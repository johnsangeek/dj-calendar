import { z } from 'zod';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .nullable()
  .optional()
  .refine((value) => value == null || value.trim() === '' || emailPattern.test(value), 'Email invalide');

const emailList = z
  .array(z.string().trim().max(200))
  .max(20, 'Trop d\'emails secondaires')
  .optional()
  .refine(
    (values) => !values || values.every((value) => value.trim() === '' || emailPattern.test(value)),
    'Un des emails secondaires est invalide',
  );

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const siretField = z
  .string()
  .trim()
  .max(32)
  .nullable()
  .optional()
  .refine((value) => {
    if (value == null || value.trim() === '') return true;
    return value.replace(/\D/g, '').length === 14;
  }, 'Le SIRET doit contenir 14 chiffres');

const colorField = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'La couleur doit être un code hexadécimal #RRGGBB')
  .optional();

const clientFields = {
  professionalName: optionalText(200),
  tradeName: optionalText(200),
  email: optionalEmail,
  primaryEmail: optionalEmail,
  altEmails: emailList,
  phone: optionalText(40),
  address: optionalText(300),
  postalCode: optionalText(12),
  city: optionalText(120),
  siret: siretField,
  notes: optionalText(5000),
  defaultRate: z.number('Le tarif doit être un nombre').nonnegative('Le tarif ne peut pas être négatif').max(1_000_000).nullable().optional(),
  clientType: z.enum(['pro', 'perso']).nullable().optional(),
  color: colorField,
  eventAliases: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
};

function emailsAgree(email: string | null | undefined, primaryEmail: string | null | undefined): boolean {
  if (email === undefined || primaryEmail === undefined) return true;
  const left = email?.trim().toLowerCase() || null;
  const right = primaryEmail?.trim().toLowerCase() || null;
  return left === right;
}

export const createClientSchema = z
  .strictObject({
    name: z.string().trim().min(1, 'Le nom est requis').max(200, 'Nom trop long'),
    ...clientFields,
  })
  .superRefine((data, ctx) => {
    if (!emailsAgree(data.email, data.primaryEmail)) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'email et primaryEmail doivent être identiques' });
    }
  });

export const updateClientSchema = z
  .strictObject({
    name: z.string().trim().min(1, 'Le nom est requis').max(200, 'Nom trop long').optional(),
    ...clientFields,
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Aucun champ à modifier' });
    }
    if (!emailsAgree(data.email, data.primaryEmail)) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'email et primaryEmail doivent être identiques' });
    }
  });

export const lineItemSchema = z.strictObject({
  description: z.string().trim().min(1, 'La description est requise').max(2000, 'Description trop longue'),
  quantity: z.number('La quantité doit être un nombre').positive('La quantité doit être supérieure à 0').max(10_000, 'Quantité trop grande'),
  unitPrice: z.number('Le prix unitaire doit être un nombre').nonnegative('Le prix unitaire ne peut pas être négatif').max(1_000_000, 'Prix unitaire trop élevé'),
  serviceId: z.string().trim().min(1).max(200).optional(),
});

export const createDocumentSchema = z
  .strictObject({
    clientId: z.string().trim().min(1).max(200).optional(),
    clientName: z.string().trim().min(1, 'Le nom du client est requis').max(200).optional(),
    bookingId: z.string().trim().min(1).max(200).optional(),
    bookingIds: z.array(z.string().trim().min(1).max(200)).max(50, 'Trop de prestations').optional(),
    lineItems: z.array(lineItemSchema).min(1, 'Ajoutez au moins une ligne').max(100, 'Trop de lignes').optional(),
    notes: z.string().max(5000, 'Notes trop longues').optional(),
    paymentMethod: z.string().trim().min(1).max(80).optional(),
    dueInDays: z.number().int().min(0).max(365).optional(),
    status: z.enum(['DRAFT', 'ISSUED']).optional(),
  })
  .superRefine((data, ctx) => {
    const bookingCount = (data.bookingIds?.length ?? 0) + (data.bookingId ? 1 : 0);
    const hasLines = (data.lineItems?.length ?? 0) > 0;
    if (!hasLines && bookingCount === 0) {
      ctx.addIssue({ code: 'custom', message: 'Indiquez lineItems ou un bookingId', path: ['lineItems'] });
    }
    if (!data.clientId && !data.clientName && bookingCount === 0) {
      ctx.addIssue({ code: 'custom', message: 'Indiquez clientId, clientName ou un bookingId', path: ['clientId'] });
    }
  });

export const updateDocumentSchema = z
  .strictObject({
    clientId: z.string().trim().min(1).max(200).optional(),
    clientName: z.string().trim().min(1).max(200).nullable().optional(),
    bookingIds: z.array(z.string().trim().min(1).max(200)).max(50, 'Trop de prestations').optional(),
    lineItems: z.array(lineItemSchema).min(1, 'Ajoutez au moins une ligne').max(100).optional(),
    notes: z.string().max(5000, 'Notes trop longues').nullable().optional(),
    paymentMethod: z.string().trim().min(1).max(80).nullable().optional(),
    status: z.enum(['DRAFT', 'ISSUED']).optional(),
    dueInDays: z.number().int().min(0).max(365).optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Aucun champ à modifier' });
    }
  });

export const paymentSchema = z.strictObject({
  amount: z.number('Le montant doit être un nombre').nonnegative('Le montant ne peut pas être négatif').max(1_000_000).optional(),
  paidAt: z.string().trim().min(1).max(40).optional(),
  paymentMethod: z.string().trim().min(1).max(80).optional(),
});

const paging = {
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
};

export const listClientsQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  ...paging,
});

export const listInvoicesQuerySchema = z.strictObject({
  clientId: z.string().trim().min(1).max(200).optional(),
  status: z.string().trim().max(200).optional(),
  documentType: z.string().trim().max(80).optional(),
  from: z.string().trim().min(1).max(40).optional(),
  to: z.string().trim().min(1).max(40).optional(),
  q: z.string().trim().max(200).optional(),
  number: z.string().trim().min(1).max(40).optional(),
  payment: z.enum(['paid', 'unpaid', 'overdue', 'open'], 'Filtre payment invalide (paid, unpaid, overdue, open)').optional(),
  ...paging,
});

export const listBookingsQuerySchema = z.strictObject({
  clientId: z.string().trim().min(1).max(200).optional(),
  status: z.string().trim().max(200).optional(),
  from: z.string().trim().min(1).max(40).optional(),
  to: z.string().trim().min(1).max(40).optional(),
  q: z.string().trim().max(200).optional(),
  invoiced: z.enum(['true', 'false'], 'Filtre invoiced invalide (true ou false)').optional(),
  ...paging,
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
