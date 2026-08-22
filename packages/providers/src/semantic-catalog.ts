import type { SemanticCapabilityDescriptor } from "../../contracts/src/index.js";
import { SemanticCapabilityRegistry } from "./adapters.js";

const cap = (
  name: string,
  risk: SemanticCapabilityDescriptor["risk"],
  sideEffectClass: SemanticCapabilityDescriptor["sideEffectClass"],
  maxSensitivity: SemanticCapabilityDescriptor["maxSensitivity"],
  credentialRequired: boolean,
  description: string,
  inputFormats: string[] = ["json"],
  outputFormats: string[] = ["json"],
  availability: "enabled" | "native" | "staged" = "enabled",
): SemanticCapabilityDescriptor => ({ name, risk, sideEffectClass, maxSensitivity, credentialRequired, availability, description, inputFormats, outputFormats });

export const UNIVERSAL_SEMANTIC_CAPABILITIES: readonly SemanticCapabilityDescriptor[] = [
  cap("email.read", "low", "none", "restricted", true, "Read an authorized mailbox message or thread."),
  cap("email.search", "low", "none", "restricted", true, "Search authorized corporate mailboxes."),
  cap("email.send", "medium", "external", "restricted", true, "Send a new external email from a Company-owned identity."),
  cap("email.reply", "medium", "external", "restricted", true, "Reply to an existing external email thread."),
  cap("calendar.read", "low", "none", "restricted", true, "Read authorized calendars and availability."),
  cap("calendar.create", "medium", "external", "restricted", true, "Create a calendar event or invitation."),
  cap("calendar.update", "medium", "reversible", "restricted", true, "Update an existing calendar event."),
  cap("contacts.search", "low", "none", "restricted", true, "Resolve a saved Company contact or directory person."),
  cap("phone.sms.send", "medium", "external", "restricted", true, "Send an SMS from a Company-owned number."),
  cap("phone.call.place", "medium", "external", "restricted", true, "Place an outbound call using an authorized Company number."),
  cap("notification.send", "low", "external", "internal", false, "Send an internal or external notification through an eligible channel."),

  cap("data.query", "low", "none", "restricted", true, "Query an authorized operational or analytical data source."),
  cap("data.write", "medium", "reversible", "restricted", true, "Write scoped operational data with authority checks."),
  cap("data.provision", "high", "external", "restricted", true, "Provision a new Company data store or database service."),
  cap("data.backup", "medium", "external", "restricted", true, "Create a durable backup of an authorized data source."),
  cap("data.restore", "high", "reversible", "restricted", true, "Restore data from a verified backup under explicit scope."),
  cap("file.read", "low", "none", "restricted", true, "Read an authorized Company file or object."),
  cap("file.write", "medium", "reversible", "restricted", true, "Create or update an authorized Company file or object."),
  cap("document.render", "low", "reversible", "internal", false, "Render a deterministic business document, PDF, DOCX or presentation."),
  cap("web.search", "low", "none", "public", false, "Search public web information for business research."),

  cap("finance.read", "medium", "none", "restricted", true, "Read authorized financial balances, movements or accounting data."),
  cap("payment.request", "high", "external", "restricted", true, "Create a payment request subject to budgets and approvals."),
  cap("payment.execute", "high", "external", "restricted", true, "Execute an approved payment inside explicit authority and budget envelopes."),

  cap("creative.image.generate", "low", "external", "internal", true, "Generate image assets through the V1 native image-generation tool.", ["json"], ["json"], "native"),
  cap("creative.image.edit", "low", "external", "internal", true, "Edit image assets through the V1 native image-generation tool.", ["json"], ["json"], "native"),
  cap("creative.vector.generate", "low", "reversible", "internal", false, "Generate vector, logo or scalable design assets through GPT-authored deterministic SVG/code."),
  cap("creative.video.generate", "low", "external", "internal", true, "Final video generation is staged and unavailable in V1 until a stable supported video tool exists.", ["json"], ["json"], "staged"),
  cap("creative.model3d.generate", "low", "external", "internal", true, "Generate a non-authoritative 3D asset."),
  cap("creative.cad.generate", "medium", "external", "restricted", true, "Generate or modify technical CAD/BIM artifacts subject to verification."),

  cap("identity.user.provision", "high", "external", "restricted", true, "Provision a Company-owned user, alias or service identity."),
  cap("domain.dns.update", "medium", "reversible", "internal", true, "Create or update Company DNS records."),
  cap("asset.provision", "medium", "external", "restricted", true, "Provision a generic Company-owned external asset when no narrower capability applies."),
] as const;

export function createUniversalSemanticCapabilityRegistry(): SemanticCapabilityRegistry {
  const registry = new SemanticCapabilityRegistry();
  for (const descriptor of UNIVERSAL_SEMANTIC_CAPABILITIES) registry.register(descriptor);
  return registry;
}
