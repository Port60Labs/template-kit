import { renderStudioPreview as renderV1 } from './preview-v1.mjs';
import { renderStudioPreview as renderV2 } from './preview-v2.mjs';
export { PREVIEW_SURFACES } from './preview-v2.mjs';

/** Explicit old artifacts keep their own fixture projection. New authoring uses v2. */
export function renderStudioPreview(files, options = {}) {
  const manifest = JSON.parse(files['manifest.json']);
  if (manifest.format === 'port60-liquid@2') return renderV2(files, options);
  if (!manifest.format || manifest.format === 'port60-liquid@1') return renderV1(files, options);
  throw new Error(`Unsupported template format '${manifest.format}' in preview.`);
}
