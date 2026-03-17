'use strict';

/* ============================================================
   Hiring Form – Validation & UX
   ============================================================ */

const form = document.getElementById('hiringForm');
const successMessage = document.getElementById('successMessage');
const successName = document.getElementById('successName');
const resetBtn = document.getElementById('resetBtn');

// ── Required field selectors ────────────────────────────────
const REQUIRED_FIELDS = [
  'firstName', 'lastName', 'email', 'phone',
  'position', 'contractType', 'availability',
  'educationLevel', 'yearsOfExperience', 'skills', 'experience',
  'coverLetter', 'cv',
];

// ── Validation rules ────────────────────────────────────────
const validators = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
    ? null : 'Adresse e-mail invalide.',

  phone: (v) => /^[\d\s\+\-\(\)]{8,}$/.test(v.trim())
    ? null : 'Numéro de téléphone invalide.',

  linkedin: (v) => {
    if (!v) return null;
    try { new URL(v); return null; } catch { return 'URL invalide.'; }
  },

  salaryMin: (v) => {
    if (!v) return null;
    return Number(v) >= 0 ? null : 'Valeur invalide.';
  },

  salaryMax: (v) => {
    if (!v) return null;
    const min = Number(document.getElementById('salaryMin').value) || 0;
    return Number(v) >= min ? null : 'Doit être supérieur au minimum.';
  },

  cv: () => {
    const input = document.getElementById('cv');
    if (!input.files || input.files.length === 0) return 'Veuillez joindre votre CV.';
    if (input.files[0].size > 5 * 1024 * 1024) return 'Le fichier dépasse 5 Mo.';
    return null;
  },

  gdprConsent: () =>
    document.getElementById('gdprConsent').checked
      ? null : 'Vous devez accepter la politique de confidentialité.',

  certifyInfo: () =>
    document.getElementById('certifyInfo').checked
      ? null : 'Vous devez certifier l\'exactitude des informations.',

  default: (v, field) => {
    if (REQUIRED_FIELDS.includes(field) && !v.trim()) {
      return 'Ce champ est obligatoire.';
    }
    return null;
  },
};

// ── Helper: get value of a field ────────────────────────────
function getValue(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return '';
  if (el.type === 'checkbox') return el.checked ? 'true' : '';
  return el.value || '';
}

// ── Helper: show / clear error on a field ───────────────────
function showError(fieldId, message) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  const container = el.closest('.form-group');
  const errorEl = container ? container.querySelector('.error-msg') : null;

  if (message) {
    el.classList.add('is-invalid');
    el.classList.remove('is-valid');
    if (errorEl) errorEl.textContent = message;
  } else {
    el.classList.remove('is-invalid');
    if (REQUIRED_FIELDS.includes(fieldId) || getValue(fieldId)) {
      el.classList.add('is-valid');
    }
    if (errorEl) errorEl.textContent = '';
  }
}

// ── Validate a single field ─────────────────────────────────
function validateField(fieldId) {
  const value = getValue(fieldId);
  const validate = validators[fieldId] || validators.default;
  const error = validate(value, fieldId);
  showError(fieldId, error);
  return !error;
}

// ── Validate consent checkboxes separately ──────────────────
function validateConsents() {
  let valid = true;

  const gdprError = validators.gdprConsent();
  const gdprEl = document.getElementById('gdpr-error');
  if (gdprError) {
    if (gdprEl) gdprEl.textContent = gdprError;
    document.getElementById('gdprConsent').classList.add('is-invalid');
    valid = false;
  } else {
    if (gdprEl) gdprEl.textContent = '';
    document.getElementById('gdprConsent').classList.remove('is-invalid');
  }

  const certifyError = validators.certifyInfo();
  const certifyEl = document.getElementById('certify-error');
  if (certifyError) {
    if (certifyEl) certifyEl.textContent = certifyError;
    document.getElementById('certifyInfo').classList.add('is-invalid');
    valid = false;
  } else {
    if (certifyEl) certifyEl.textContent = '';
    document.getElementById('certifyInfo').classList.remove('is-invalid');
  }

  return valid;
}

// ── Full form validation ─────────────────────────────────────
function validateAll() {
  const fieldResults = REQUIRED_FIELDS.map(validateField);
  // Also validate optional-but-constrained fields
  ['linkedin', 'salaryMin', 'salaryMax'].forEach(validateField);
  const consentsOk = validateConsents();
  return fieldResults.every(Boolean) && consentsOk;
}

// ── Live validation on blur ──────────────────────────────────
REQUIRED_FIELDS.forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('blur', () => validateField(id));
  el.addEventListener('input', () => {
    if (el.classList.contains('is-invalid')) validateField(id);
  });
});

['linkedin', 'salaryMin', 'salaryMax'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('blur', () => validateField(id));
});

// ── File upload feedback ─────────────────────────────────────
['cv', 'portfolio'].forEach((id) => {
  const input = document.getElementById(id);
  if (!input) return;
  const wrapper = input.closest('.file-upload-wrapper');
  const textEl = wrapper ? wrapper.querySelector('.file-text') : null;

  input.addEventListener('change', () => {
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (textEl) textEl.textContent = file.name;
      if (wrapper) wrapper.classList.add('has-file');
      if (id === 'cv') validateField('cv');
    } else {
      if (textEl) textEl.textContent = 'Glissez votre fichier ici ou cliquez';
      if (wrapper) wrapper.classList.remove('has-file');
    }
  });
});

// ── Consent live feedback ────────────────────────────────────
['gdprConsent', 'certifyInfo'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', validateConsents);
});

// ── Form submit ──────────────────────────────────────────────
form.addEventListener('submit', (e) => {
  e.preventDefault();

  if (!validateAll()) {
    // Scroll to first error
    const firstInvalid = form.querySelector('.is-invalid');
    if (firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstInvalid.focus();
    }
    return;
  }

  // Simulate async submission
  const submitBtn = form.querySelector('.btn-primary');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Envoi en cours…';

  setTimeout(() => {
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();

    form.classList.add('hidden');
    successMessage.classList.remove('hidden');
    successName.textContent = `${firstName} ${lastName}`;
    successMessage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 1200);
});

// ── Reset button ─────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
  if (!confirm('Réinitialiser tous les champs du formulaire ?')) return;

  form.reset();

  // Clear validation styles
  form.querySelectorAll('.is-invalid, .is-valid').forEach((el) => {
    el.classList.remove('is-invalid', 'is-valid');
  });
  form.querySelectorAll('.error-msg').forEach((el) => {
    el.textContent = '';
  });
  form.querySelectorAll('.file-upload-wrapper').forEach((wrapper) => {
    wrapper.classList.remove('has-file');
    const textEl = wrapper.querySelector('.file-text');
    if (textEl) textEl.textContent = 'Glissez votre fichier ici ou cliquez pour parcourir';
  });
});
