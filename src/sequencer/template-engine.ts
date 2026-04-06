import { type Lead, type LeadEnrichment, getEnrichmentByLeadId } from '../db/index.js';

export interface TemplateVariables {
  business_name: string;
  first_name?: string;
  city?: string;
  state?: string;
  website?: string;
  specialties?: string;
  personalized_opening?: string;
  [key: string]: string | undefined;
}

/**
 * Extract template variables from lead data
 */
export function extractTemplateVariables(lead: Lead, enrichment?: LeadEnrichment | null): TemplateVariables {
  // Try to extract first name from business name (for solo tutors)
  let firstName: string | undefined;
  if (lead.business_type === 'solo_tutor' && lead.business_name) {
    // Common patterns: "John's Tutoring", "John Smith Tutoring", "Tutoring by John"
    const nameMatch = lead.business_name.match(/^([A-Z][a-z]+)(?:'s|\s)/);
    if (nameMatch) {
      firstName = nameMatch[1];
    }
  }

  // Parse specialties from enrichment
  let specialties: string | undefined;
  if (enrichment?.specialties) {
    try {
      const parsed = JSON.parse(enrichment.specialties);
      if (Array.isArray(parsed) && parsed.length > 0) {
        specialties = parsed.slice(0, 3).join(', ');
      }
    } catch {
      // Ignore parse errors
    }
  }

  return {
    business_name: lead.business_name,
    first_name: firstName,
    city: lead.city || undefined,
    state: lead.state_province || undefined,
    website: lead.website || undefined,
    specialties
  };
}

/**
 * Render a template string with variables using {{mustache}} syntax
 */
export function renderTemplate(template: string, variables: TemplateVariables): string {
  let result = template;

  // Replace {{variable}} patterns
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    return value !== undefined ? value : match; // Keep original if no value
  });

  // Handle conditional blocks {{#if variable}}...{{/if}}
  result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
    const value = variables[key];
    return value ? content : '';
  });

  // Handle inverse conditional {{#unless variable}}...{{/unless}}
  result = result.replace(/\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (match, key, content) => {
    const value = variables[key];
    return !value ? content : '';
  });

  return result.trim();
}

/**
 * Generate a personalized opening line based on lead data
 * This can be enhanced with LLM integration later
 */
export function generatePersonalizedOpening(lead: Lead, enrichment?: LeadEnrichment | null): string {
  const openings: string[] = [];

  // Location-based opening
  if (lead.city && lead.state_province) {
    openings.push(`I noticed you're helping students in the ${lead.city} area`);
  }

  // Specialties-based opening
  if (enrichment?.specialties) {
    try {
      const specialties = JSON.parse(enrichment.specialties);
      if (Array.isArray(specialties) && specialties.length > 0) {
        const subject = specialties[0];
        openings.push(`Your focus on ${subject} tutoring caught my attention`);
      }
    } catch {
      // Ignore
    }
  }

  // Reviews-based opening
  if (lead.google_rating && lead.google_rating >= 4.5 && lead.google_review_count && lead.google_review_count >= 10) {
    openings.push(`I saw your excellent ${lead.google_rating}-star rating from ${lead.google_review_count} reviews`);
  }

  // Multiple tutors opening
  if (enrichment?.has_multiple_tutors) {
    openings.push(`I see you have a team of tutors working with students`);
  }

  // Default opening
  if (openings.length === 0) {
    openings.push(`I came across ${lead.business_name} while researching tutoring businesses`);
  }

  // Pick a random opening for variety
  return openings[Math.floor(Math.random() * openings.length)];
}

/**
 * Render a full email from template and lead data
 */
export function renderEmail(
  subjectTemplate: string,
  bodyTemplate: string,
  lead: Lead,
  options: { includePersonalizedOpening?: boolean } = {}
): { subject: string; body: string } {
  const enrichment = getEnrichmentByLeadId(lead.id);
  const variables = extractTemplateVariables(lead, enrichment);

  // Add personalized opening if requested
  if (options.includePersonalizedOpening) {
    variables.personalized_opening = generatePersonalizedOpening(lead, enrichment);
  }

  return {
    subject: renderTemplate(subjectTemplate, variables),
    body: renderTemplate(bodyTemplate, variables)
  };
}

/**
 * Validate a template string for syntax errors
 */
export function validateTemplate(template: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for unclosed mustache tags
  const openBraces = (template.match(/\{\{/g) || []).length;
  const closeBraces = (template.match(/\}\}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push(`Mismatched braces: ${openBraces} opening vs ${closeBraces} closing`);
  }

  // Check for unclosed conditionals
  const ifOpens = (template.match(/\{\{#if\s+\w+\}\}/g) || []).length;
  const ifCloses = (template.match(/\{\{\/if\}\}/g) || []).length;
  if (ifOpens !== ifCloses) {
    errors.push(`Unclosed {{#if}} blocks: ${ifOpens} opens vs ${ifCloses} closes`);
  }

  const unlessOpens = (template.match(/\{\{#unless\s+\w+\}\}/g) || []).length;
  const unlessCloses = (template.match(/\{\{\/unless\}\}/g) || []).length;
  if (unlessOpens !== unlessCloses) {
    errors.push(`Unclosed {{#unless}} blocks: ${unlessOpens} opens vs ${unlessCloses} closes`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
