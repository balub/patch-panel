import yaml from 'js-yaml';
import { validate } from './schema';
import type { ValidationResult } from './types';

export function parseYaml(raw: string): ValidationResult {
  let doc: unknown;
  try {
    doc = yaml.load(raw);
  } catch {
    return { ok: false, errors: ['Invalid YAML syntax'] };
  }
  return validate(doc);
}
