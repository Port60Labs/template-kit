// Existing artifacts are validated against their own contract. New uploads have an explicit v2 gate.
import { validateArtifact as validateV1Artifact } from './validate-v1.mjs';
import { validateArtifact as validateV2Artifact } from './validate-v2.mjs';
export { validateV1Artifact, validateV2Artifact };
// Historical consumers use these exact v1 exports; v2 consumers select the versioned module.
export { contractDialect, sectionCatalogue, islandRegistry, contextContract, behaviourCatalogue, BEHAVIOUR_PRIMARY_ATTR } from './validate-v1.mjs';

function manifestOf(files) {
  try { return JSON.parse(files['manifest.json'] ?? 'null'); }
  catch { return null; }
}

export function validateArtifact(files) {
  const manifest = manifestOf(files);
  if (manifest?.format === 'port60-liquid@2') return validateV2Artifact(files);
  if (manifest?.format === 'port60-liquid@1' || !manifest?.format) return validateV1Artifact(files);
  return Promise.resolve({ errors: [`Unsupported template format '${manifest.format}'. This host accepts port60-liquid@1 and port60-liquid@2 for existing artifacts.`], warnings: [], manifest });
}

export function validateNewArtifact(files) {
  const manifest = manifestOf(files);
  if (manifest?.format !== 'port60-liquid@2') return Promise.resolve({ errors: ['New uploads require port60-liquid@2. Migrate the template with kit 1.0.0; existing v1 pins are not changed.'], warnings: [], manifest });
  return validateV2Artifact(files);
}
