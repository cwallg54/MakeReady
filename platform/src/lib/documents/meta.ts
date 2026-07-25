export type CustomerDocType = "terms_application" | "credit_card_application";

export const DOC_LABELS: Record<CustomerDocType, string> = {
  terms_application: "Terms / Credit Application",
  credit_card_application: "Credit Card Application",
};

export interface DocField {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "number" | "select" | "textarea";
  required?: boolean;
  options?: string[];
  half?: boolean; // render two-up on wider screens
}

export interface DocSection {
  title: string;
  note?: string;
  fields: DocField[];
}

const businessSection: DocSection = {
  title: "Business Information",
  fields: [
    { name: "company", label: "Company", required: true },
    { name: "billingAddress", label: "Billing Address", required: true },
    { name: "billingCity", label: "Billing City", required: true, half: true },
    { name: "billingState", label: "Billing State", required: true, half: true },
    { name: "billingZip", label: "Billing ZIP", required: true, half: true },
    { name: "shippingAddress", label: "Shipping Address" },
    { name: "shippingCity", label: "Shipping City", half: true },
    { name: "shippingState", label: "Shipping State", half: true },
    { name: "shippingZip", label: "Shipping ZIP", half: true },
    { name: "telephone", label: "Telephone", type: "tel", required: true, half: true },
    { name: "fax", label: "Fax", type: "tel", half: true },
    { name: "email", label: "E-mail", type: "email", required: true, half: true },
    { name: "ownershipType", label: "Type of Ownership", type: "select", required: true, options: ["Corporation", "Partnership", "Sole Proprietorship"], half: true },
    { name: "howLongEstablished", label: "How Long Established?", required: true, half: true },
    { name: "typeOfBusiness", label: "Type of Business", required: true, half: true },
  ],
};

const contactsSection: DocSection = {
  title: "Contacts",
  fields: [
    { name: "ownerName", label: "Owner's Name", required: true, half: true },
    { name: "ownerEmail", label: "Owner's Email", type: "email", half: true },
    { name: "contactName", label: "Additional Contact Name", half: true },
    { name: "contactTitle", label: "Title", half: true },
    { name: "contactEmail", label: "Email", type: "email", half: true },
    { name: "contactPhone", label: "Phone", type: "tel", half: true },
  ],
};

const apSection: DocSection = {
  title: "Accounts Payable",
  note: "Invoices will be emailed to this address.",
  fields: [
    { name: "apContactName", label: "AP Contact Name", required: true, half: true },
    { name: "apPhone", label: "AP Phone", type: "tel", required: true, half: true },
    { name: "apEmail", label: "AP Email Address", type: "email", required: true },
  ],
};

const bankSection: DocSection = {
  title: "Bank Reference",
  fields: [
    { name: "bankName", label: "Bank Name", half: true },
    { name: "bankPhone", label: "Phone", type: "tel", half: true },
    { name: "bankAddress", label: "Address" },
    { name: "bankOfficer", label: "Officer to Contact" },
  ],
};

function tradeRef(n: number): DocField[] {
  return [
    { name: `tradeRef${n}Name`, label: `Trade Ref ${n} — Name`, required: n <= 3, half: true },
    { name: `tradeRef${n}Email`, label: `Trade Ref ${n} — Email`, type: "email", required: n <= 3, half: true },
    { name: `tradeRef${n}Phone`, label: `Trade Ref ${n} — Phone`, type: "tel", half: true },
    { name: `tradeRef${n}Account`, label: `Trade Ref ${n} — Account #`, half: true },
  ];
}

const tradeSection: DocSection = {
  title: "Trade References",
  note: "At least 3 responding references are required.",
  fields: [...tradeRef(1), ...tradeRef(2), ...tradeRef(3)],
};

const creditSection: DocSection = {
  title: "Credit Requested",
  fields: [{ name: "amountRequested", label: "Amount of Credit Requested", type: "number", required: true }],
};

export const CC_TERMS_TEXT =
  "The credit card provided will be charged when the order is ready to ship. A 3% processing fee applies to all credit card transactions (effective April 1, 2026). After submitting, please contact stacie@g54.com to securely provide card details — do NOT enter card numbers here. Prefer to avoid the fee? Request ACH info or complete the Terms Application instead.";

export const TERMS_TERMS_TEXT =
  "First order: COD, credit card, or on approved credit. Subsequent orders Net 30 after credit is established. 1.5%/month (18% APR) on amounts unpaid after 30 days; in default, undersigned agrees to interest, 50% collection costs, and reasonable attorney fees. I authorize you or your agent to obtain a credit report and certify the information is true and correct.";

export function sectionsFor(docType: CustomerDocType): DocSection[] {
  if (docType === "terms_application") {
    return [businessSection, contactsSection, apSection, bankSection, tradeSection, creditSection];
  }
  return [businessSection, contactsSection, apSection];
}

/** Human label for a stored data key (staff view). */
export function fieldLabel(key: string): string {
  for (const s of [...sectionsFor("terms_application")]) {
    const f = s.fields.find((x) => x.name === key);
    if (f) return f.label;
  }
  if (key === "signedName") return "Signed (typed name)";
  if (key === "signedTitle") return "Title";
  if (key === "signedDate") return "Date";
  return key;
}
