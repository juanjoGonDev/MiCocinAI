import { DifficultyPipe } from './difficulty.pipe';

describe('DifficultyPipe', () => {
  let pipe: DifficultyPipe;

  beforeEach(() => {
    pipe = new DifficultyPipe();
  });

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should transform easy to Fácil', () => {
    expect(pipe.transform('easy')).toBe('Fácil');
  });

  it('should transform medium to Medio', () => {
    expect(pipe.transform('medium')).toBe('Medio');
  });

  it('should transform hard to Difícil', () => {
    expect(pipe.transform('hard')).toBe('Difícil');
  });

  it('should show icon when showIcon is true', () => {
    expect(pipe.transform('easy', true)).toBe('🟢 Fácil');
    expect(pipe.transform('medium', true)).toBe('🟡 Medio');
    expect(pipe.transform('hard', true)).toBe('🔴 Difícil');
  });

  it('should return empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(pipe.transform(undefined)).toBe('');
  });

  it('should return original value for unknown difficulty', () => {
    expect(pipe.transform('unknown')).toBe('unknown');
  });
});
