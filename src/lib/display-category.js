import { CATEGORY_MAP } from '@/lib/constants';

const PERSONAL_CARE = CATEGORY_MAP.personal;
const PERSONAL_CARE_NAME_MARKERS = [
  'spf',
  'nivea sun',
  'carroten',
  'noxzema',
  'ambre solaire',
  'sunscreen',
  'sun block',
  'sun lotion',
  'after sun',
  '\u03b1\u03bd\u03c4\u03b7\u03bb\u03b9\u03b1\u03ba',
];

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function displayCategoryForProduct(productName, category) {
  const n = normalize(productName);
  if (PERSONAL_CARE && PERSONAL_CARE_NAME_MARKERS.some((marker) => n.includes(marker))) {
    return PERSONAL_CARE;
  }
  return category;
}
