import { describe, expect, it } from 'vitest';
import { cleanTranscript } from './ml';

describe('фильтр галлюцинаций Whisper', () => {
  it('убирает титры и мусор на тишине', () => {
    expect(cleanTranscript('Редактор субтитров А.Синецкая Корректор А.Егорова')).toBe('');
    expect(cleanTranscript('Продолжение следует...')).toBe('');
    expect(cleanTranscript('...')).toBe('');
    expect(cleanTranscript('да да да да да да да')).toBe('');
  });
  it('оставляет обычную речь', () => {
    expect(cleanTranscript(' Привет, я уже еду домой, буду минут через двадцать. ')).toBe('Привет, я уже еду домой, буду минут через двадцать.');
  });
});
