import {
  COMMON_ALLERGENS,
  COMMON_DISLIKES,
  COMMON_LIKES,
  emptyTasteProfile,
  GOAL_OPTIONS,
  hasTasteProfile
} from './taste-profile';
import { hasIcon } from '../components/ui/icon/icon-paths';

describe('taste profile icon metadata', () => {
  it('maps every goal to a registered SVG icon', () => {
    expect(GOAL_OPTIONS.map(({ icon }) => icon)).toEqual([
      'scale',
      'remove_circle',
      'add_circle',
      'favorite',
      'star',
      'edit'
    ]);
    expect(GOAL_OPTIONS.every(({ icon }) => hasIcon(icon))).toBeTrue();
  });

  it('keeps the approved food emojis in allergy and taste catalogs', () => {
    expect(COMMON_ALLERGENS.find(({ value }) => value === 'Gluten')?.icon).toBe('🌾');
    expect(COMMON_LIKES.find(({ value }) => value === 'Pollo')?.icon).toBe('🍗');
    expect(COMMON_DISLIKES.find(({ value }) => value === 'Vísceras y casquería')?.icon).toBe('🫀');
  });
});

describe('taste profile presence', () => {
  it('recognizes an absent or empty profile as empty', () => {
    expect(hasTasteProfile(null)).toBeFalse();
    expect(hasTasteProfile(emptyTasteProfile())).toBeFalse();
  });

  it('recognizes allergies, likes, dislikes, and notes', () => {
    expect(hasTasteProfile({ ...emptyTasteProfile(), allergies: ['Gluten'] })).toBeTrue();
    expect(hasTasteProfile({ ...emptyTasteProfile(), likes: ['Pollo'] })).toBeTrue();
    expect(hasTasteProfile({ ...emptyTasteProfile(), dislikes: ['Anchoas'] })).toBeTrue();
    expect(hasTasteProfile({ ...emptyTasteProfile(), notes: 'Ceno pronto' })).toBeTrue();
  });

  it('recognizes goal notes and non-default goals', () => {
    expect(
      hasTasteProfile({ ...emptyTasteProfile(), goalNotes: 'Sin carne los lunes' })
    ).toBeTrue();
    expect(hasTasteProfile({ ...emptyTasteProfile(), goal: 'variety' })).toBeTrue();
  });
});
