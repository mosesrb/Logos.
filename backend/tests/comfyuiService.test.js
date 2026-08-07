import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateViaComfyUI, _comfyFallback } from '../services/comfyuiService.js';
import fs from 'fs';
import path from 'path';

vi.mock('node-fetch');
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(JSON.stringify({ prompt: {} }))
  }
}));

describe('comfyuiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('_comfyFallback', () => {
    it('should generate a fallback path correctly', () => {
      const fallback = _comfyFallback('test.png');
      expect(fallback).toContain('test.png');
    });
  });

  describe('generateViaComfyUI', () => {
    it('should handle network errors gracefully', async () => {
      const fetch = (await import('node-fetch')).default;
      fetch.mockRejectedValueOnce(new Error('Network Error'));

      const result = await generateViaComfyUI({ prompt: 'test' });
      // The function returns a fallback placeholder or array
      // either string or [string] or array of objects with url
      if (Array.isArray(result)) {
        if (typeof result[0] === 'string') {
          expect(result[0]).toContain('fallback');
        } else {
          expect(result[0].url).toContain('fallback');
        }
      } else {
        expect(result).toContain('fallback');
      }
    });

    it('should parse comfyui response and return generated image', async () => {
      const fetch = (await import('node-fetch')).default;
      
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          prompt_id: '12345'
        })
      };

      fetch.mockResolvedValueOnce(mockResponse); // Queue prompt
      
      const mockHistoryResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          '12345': {
            status: { completed: true },
            outputs: {
              '9': {
                images: [
                  { filename: 'generated_image.png', subfolder: '', type: 'output' }
                ]
              }
            }
          }
        })
      };

      // Mock the polling fetch
      fetch.mockResolvedValueOnce(mockHistoryResponse);

      const result = await generateViaComfyUI({ prompt: 'test workflow' });
      
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result[0]).toContain('/output/generated_image.png');
    });
  });
});
