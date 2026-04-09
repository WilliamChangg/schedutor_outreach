"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTemplateVariables = extractTemplateVariables;
exports.renderTemplate = renderTemplate;
exports.generatePersonalizedOpening = generatePersonalizedOpening;
exports.renderEmail = renderEmail;
exports.validateTemplate = validateTemplate;
var index_js_1 = require("../db/index.js");
/**
 * Extract template variables from lead data
 */
function extractTemplateVariables(lead, enrichment) {
    // Try to extract first name from business name (for solo tutors)
    var firstName;
    if (lead.business_type === 'solo_tutor' && lead.business_name) {
        // Common patterns: "John's Tutoring", "John Smith Tutoring", "Tutoring by John"
        var nameMatch = lead.business_name.match(/^([A-Z][a-z]+)(?:'s|\s)/);
        if (nameMatch) {
            firstName = nameMatch[1];
        }
    }
    // Parse specialties from enrichment
    var specialties;
    if (enrichment === null || enrichment === void 0 ? void 0 : enrichment.specialties) {
        try {
            var parsed = JSON.parse(enrichment.specialties);
            if (Array.isArray(parsed) && parsed.length > 0) {
                specialties = parsed.slice(0, 3).join(', ');
            }
        }
        catch (_a) {
            // Ignore parse errors
        }
    }
    return {
        business_name: lead.business_name,
        first_name: firstName,
        city: lead.city || undefined,
        state: lead.state_province || undefined,
        website: lead.website || undefined,
        specialties: specialties
    };
}
/**
 * Render a template string with variables using {{mustache}} syntax
 */
function renderTemplate(template, variables) {
    var result = template;
    // Replace {{variable}} patterns
    result = result.replace(/\{\{(\w+)\}\}/g, function (match, key) {
        var value = variables[key];
        return value !== undefined ? value : match; // Keep original if no value
    });
    // Handle conditional blocks {{#if variable}}...{{/if}}
    result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, function (match, key, content) {
        var value = variables[key];
        return value ? content : '';
    });
    // Handle inverse conditional {{#unless variable}}...{{/unless}}
    result = result.replace(/\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, function (match, key, content) {
        var value = variables[key];
        return !value ? content : '';
    });
    return result.trim();
}
/**
 * Generate a personalized opening line based on lead data
 * This can be enhanced with LLM integration later
 */
function generatePersonalizedOpening(lead, enrichment) {
    var openings = [];
    // Location-based opening
    if (lead.city && lead.state_province) {
        openings.push("I noticed you're helping students in the ".concat(lead.city, " area"));
    }
    // Specialties-based opening
    if (enrichment === null || enrichment === void 0 ? void 0 : enrichment.specialties) {
        try {
            var specialties = JSON.parse(enrichment.specialties);
            if (Array.isArray(specialties) && specialties.length > 0) {
                var subject = specialties[0];
                openings.push("Your focus on ".concat(subject, " tutoring caught my attention"));
            }
        }
        catch (_a) {
            // Ignore
        }
    }
    // Reviews-based opening
    if (lead.google_rating && lead.google_rating >= 4.5 && lead.google_review_count && lead.google_review_count >= 10) {
        openings.push("I saw your excellent ".concat(lead.google_rating, "-star rating from ").concat(lead.google_review_count, " reviews"));
    }
    // Multiple tutors opening
    if (enrichment === null || enrichment === void 0 ? void 0 : enrichment.has_multiple_tutors) {
        openings.push("I see you have a team of tutors working with students");
    }
    // Default opening
    if (openings.length === 0) {
        openings.push("I came across ".concat(lead.business_name, " while researching tutoring businesses"));
    }
    // Pick a random opening for variety
    return openings[Math.floor(Math.random() * openings.length)];
}
/**
 * Render a full email from template and lead data
 */
function renderEmail(subjectTemplate, bodyTemplate, lead, options) {
    if (options === void 0) { options = {}; }
    var enrichment = (0, index_js_1.getEnrichmentByLeadId)(lead.id);
    var variables = extractTemplateVariables(lead, enrichment);
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
function validateTemplate(template) {
    var errors = [];
    // Check for unclosed mustache tags
    var openBraces = (template.match(/\{\{/g) || []).length;
    var closeBraces = (template.match(/\}\}/g) || []).length;
    if (openBraces !== closeBraces) {
        errors.push("Mismatched braces: ".concat(openBraces, " opening vs ").concat(closeBraces, " closing"));
    }
    // Check for unclosed conditionals
    var ifOpens = (template.match(/\{\{#if\s+\w+\}\}/g) || []).length;
    var ifCloses = (template.match(/\{\{\/if\}\}/g) || []).length;
    if (ifOpens !== ifCloses) {
        errors.push("Unclosed {{#if}} blocks: ".concat(ifOpens, " opens vs ").concat(ifCloses, " closes"));
    }
    var unlessOpens = (template.match(/\{\{#unless\s+\w+\}\}/g) || []).length;
    var unlessCloses = (template.match(/\{\{\/unless\}\}/g) || []).length;
    if (unlessOpens !== unlessCloses) {
        errors.push("Unclosed {{#unless}} blocks: ".concat(unlessOpens, " opens vs ").concat(unlessCloses, " closes"));
    }
    return {
        valid: errors.length === 0,
        errors: errors
    };
}
