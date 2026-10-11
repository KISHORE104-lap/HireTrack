// lib/validate.js
// Checks the data the browser sends BEFORE we save it.
// Never trust input from the browser: anyone can send anything to an API.

const STATUSES = ['Wishlist', 'Applied', 'Interview', 'Offer', 'Rejected'];

// Returns { ok: true, value: cleanObject } or { ok: false, errors: [...] }
function validateApplication(input) {
  const errors = [];
  const data = input && typeof input === 'object' ? input : {};

  // Helper: turn anything into a trimmed string with a maximum length
  const text = (value, max) => String(value == null ? '' : value).trim().slice(0, max);

  const clean = {
    company: text(data.company, 80),
    role: text(data.role, 80),
    location: text(data.location, 60),
    status: text(data.status, 20) || 'Applied',
    appliedOn: text(data.appliedOn, 10),
    interviewOn: text(data.interviewOn, 10),
    link: text(data.link, 300),
    notes: text(data.notes, 1000)
  };

  // Required fields
  if (!clean.company) errors.push('Company name is required.');
  if (!clean.role) errors.push('Job role is required.');

  // Status must be one of the allowed values
  if (!STATUSES.includes(clean.status)) {
    errors.push('Status must be one of: ' + STATUSES.join(', ') + '.');
  }

  // Dates must look like YYYY-MM-DD (or be empty)
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (clean.appliedOn && !datePattern.test(clean.appliedOn)) errors.push('Applied date must be YYYY-MM-DD.');
  if (clean.interviewOn && !datePattern.test(clean.interviewOn)) errors.push('Interview date must be YYYY-MM-DD.');

  // Links must start with http:// or https:// (or be empty)
  if (clean.link && !/^https?:\/\//i.test(clean.link)) errors.push('Job link must start with http:// or https://.');

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: clean };
}

module.exports = { validateApplication, STATUSES };
