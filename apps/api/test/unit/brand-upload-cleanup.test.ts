import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { BrandImportsController } from '../../src/modules/brand-imports/brand-imports.controller.js';

it('removes the uploaded temporary file when multipart metadata fails validation', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hedax-upload-cleanup-'));
  const file = path.join(dir, 'upload.csv');
  try {
    await writeFile(file, 'Part No\n000123\n');
    const service = { upload: vi.fn() };
    const controller = new BrandImportsController(service as never);
    await expect(controller.upload({} as never, { path: file } as never, {})).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(service.upload).not.toHaveBeenCalled();
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
