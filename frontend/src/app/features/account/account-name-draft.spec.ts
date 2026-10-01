import { nameDraftIsDirty } from './account-name-draft';

describe('nameDraftIsDirty', () => {
  it('detects an unsaved value', () => {
    expect(nameDraftIsDirty('Bea', 'Ana Belen')).toBeTrue();
  });

  it('ignores whitespace the server trims before saving', () => {
    expect(nameDraftIsDirty(' Ana Belen ', 'Ana Belen')).toBeFalse();
  });

  it('treats an empty draft as a change from a saved name', () => {
    expect(nameDraftIsDirty('', 'Ana Belen')).toBeTrue();
  });
});
