export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
class FieldError extends Error {}
const bad = (m) => { throw new FieldError(m); };

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export const rules = {
  str: ({ min = 1, max = 200, optional = false } = {}) => (v) => {
    if (isBlank(v)) { if (optional) return null; return bad('Champ requis'); }
    if (typeof v !== 'string') return bad('Texte attendu');
    const s = v.trim();
    if (s.length < min) return bad(`Minimum ${min} caractères`);
    if (s.length > max) return bad(`Maximum ${max} caractères`);
    return s;
  },
  int: ({ min = -Infinity, max = Infinity, optional = false } = {}) => (v) => {
    if (isBlank(v)) { if (optional) return null; return bad('Champ requis'); }
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isInteger(n)) return bad('Nombre entier attendu');
    if (n < min || n > max) return bad(`Valeur entre ${min} et ${max} attendue`);
    return n;
  },
  oneOf: (list) => (v) => (list.includes(v) ? v : bad('Valeur non permise')),
  bool: () => (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0),
  email: () => (v) => {
    const s = rules.str({ max: 254 })(v).toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : bad('Courriel invalide');
  },
  date: ({ optional = false } = {}) => (v) => {
    if (isBlank(v)) { if (optional) return null; return bad('Champ requis'); }
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return bad('Date invalide (AAAA-MM-JJ)');
    const d = new Date(v + 'T00:00:00Z');
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return bad('Date invalide');
    return v;
  },
  time: () => (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : bad('Heure invalide (HH:MM)')),
  postal: () => (v) => {
    if (isBlank(v)) return null;
    const s = String(v).toUpperCase().replace(/\s+/g, '');
    return /^[ABCEGHJ-NPRSTVXY]\d[A-Z]\d[A-Z]\d$/.test(s) ? `${s.slice(0, 3)} ${s.slice(3)}` : bad('Code postal invalide');
  },
  phone: () => (v) => {
    if (isBlank(v)) return null;
    const digits = String(v).replace(/\D/g, '');
    return digits.length === 10 || (digits.length === 11 && digits[0] === '1')
      ? String(v).trim().slice(0, 30)
      : bad('Numéro de téléphone invalide');
  },
  password: () => (v) => {
    if (typeof v !== 'string' || v.length < 10) return bad('Minimum 10 caractères');
    if (v.length > 200) return bad('Maximum 200 caractères');
    return v;
  },
};

export function parse(input, spec) {
  const out = {};
  const errors = {};
  const src = input && typeof input === 'object' ? input : {};
  for (const [key, fn] of Object.entries(spec)) {
    try {
      out[key] = fn(src[key]);
    } catch (e) {
      if (e instanceof FieldError) errors[key] = e.message;
      else throw e;
    }
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Certaines données sont invalides.', errors);
  return out;
}
