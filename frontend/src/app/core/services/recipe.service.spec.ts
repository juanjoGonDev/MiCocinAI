import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Recipe, RecipeFilter } from '../../shared/models/recipe.model';
import { RecipeService } from './recipe.service';

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'recipe-1',
    name: 'Sopa QA',
    description: 'Una receta sintética',
    difficulty: 'easy',
    cuisine: 'casera',
    mealType: ['dinner'],
    totalTime: 20,
    prepTime: 5,
    cookTime: 15,
    servings: 2,
    ingredients: [],
    utensils: [],
    steps: [],
    author: 'user',
    timesCooked: 0,
    tags: [],
    isFavorite: false,
    isPublic: false,
    createdAt: new Date('2026-09-30T00:00:00Z'),
    updatedAt: new Date('2026-09-30T00:00:00Z'),
    ...overrides
  };
}

describe('RecipeService', () => {
  let service: RecipeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [RecipeService] });
    service = TestBed.inject(RecipeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads recipes, maps all supported filters, and resets loading after a server error', () => {
    service.loadRecipes();
    expect(service.isLoading()).toBeTrue();
    http.expectOne('/api/recipes').flush({ data: { recipes: [makeRecipe()], total: 1 } });
    expect(service.recipes()).toEqual([makeRecipe()]);
    expect(service.total()).toBe(1);
    expect(service.isLoading()).toBeFalse();

    const filter: RecipeFilter = {
      search: 'sopa', difficulty: 'easy', mealType: 'dinner', maxTime: 30, isFavorite: true, author: 'ai'
    };
    service.loadRecipes(filter);
    const request = http.expectOne('/api/recipes?search=sopa&difficulty=easy&mealType=dinner&maxTime=30&isFavorite=true&author=ai');
    request.flush({ data: { recipes: [], total: 0 } });
    expect(service.recipes()).toEqual([]);
    expect(service.total()).toBe(0);

    service.loadRecipes();
    http.expectOne('/api/recipes').flush({}, { status: 500, statusText: 'Server Error' });
    expect(service.isLoading()).toBeFalse();
  });

  it('returns the recipe DTO itself and updates currentRecipe for a deep-link read', () => {
    const expected = makeRecipe();
    let result: Recipe | null | undefined;

    service.getRecipe(expected.id).subscribe((value) => result = value);
    http.expectOne(`/api/recipes/${expected.id}`).flush({ success: true, data: expected });

    expect(result).toEqual(expected);
    expect(service.currentRecipe()).toEqual(expected);
  });

  it('returns null for a missing recipe', () => {
    let result: Recipe | null | undefined;
    service.getRecipe('missing').subscribe((value) => result = value);
    http.expectOne('/api/recipes/missing').flush({ message: 'not found' }, { status: 404, statusText: 'Not Found' });
    expect(result).toBeNull();
  });

  it('prepends a created recipe and returns null without changing the list on failure', () => {
    const existing = makeRecipe();
    service.loadRecipes();
    http.expectOne('/api/recipes').flush({ data: { recipes: [existing], total: 1 } });

    const created = makeRecipe({ id: 'recipe-2', name: 'Nueva' });
    let result: Recipe | null | undefined;
    service.createRecipe({ name: created.name }).subscribe((value) => result = value);
    http.expectOne({ method: 'POST', url: '/api/recipes' }).flush({ data: created });
    expect(result).toEqual(created);
    expect(service.recipes()).toEqual([created, existing]);

    let failed: Recipe | null | undefined;
    service.createRecipe({ name: 'No guardada' }).subscribe((value) => failed = value);
    http.expectOne({ method: 'POST', url: '/api/recipes' }).flush({}, { status: 500, statusText: 'Server Error' });
    expect(failed).toBeNull();
    expect(service.recipes()).toEqual([created, existing]);
  });

  it('toggles favorite for the matching recipe and preserves state on failure', () => {
    const initial = makeRecipe();
    service.loadRecipes();
    http.expectOne('/api/recipes').flush({ data: { recipes: [initial], total: 1 } });

    service.toggleFavorite(initial.id);
    http.expectOne({ method: 'POST', url: `/api/recipes/${initial.id}/favorite` }).flush({ data: { isFavorite: true } });
    expect(service.recipes()[0].isFavorite).toBeTrue();

    service.toggleFavorite(initial.id);
    http.expectOne({ method: 'POST', url: `/api/recipes/${initial.id}/favorite` }).flush({}, { status: 500, statusText: 'Server Error' });
    expect(service.recipes()[0].isFavorite).toBeTrue();
  });

  it('removes a successfully unfavorited recipe from favorites results only', () => {
    const first = makeRecipe({ id: 'favorite-1', isFavorite: true });
    const second = makeRecipe({ id: 'favorite-2', name: 'Otra sopa', isFavorite: true });
    service.loadRecipes({ isFavorite: true });
    http.expectOne('/api/recipes?isFavorite=true').flush({
      data: { recipes: [first, second], total: 2 }
    });

    service.toggleFavorite(first.id);
    http
      .expectOne({ method: 'POST', url: `/api/recipes/${first.id}/favorite` })
      .flush({}, { status: 500, statusText: 'Server Error' });
    expect(service.recipes()).toEqual([first, second]);
    expect(service.total()).toBe(2);

    service.toggleFavorite(first.id);
    http
      .expectOne({ method: 'POST', url: `/api/recipes/${first.id}/favorite` })
      .flush({ data: { isFavorite: false } });

    expect(service.recipes()).toEqual([second]);
    expect(service.total()).toBe(1);
  });

  it('keeps an unfavorited recipe visible in unfiltered results', () => {
    const first = makeRecipe({ id: 'favorite-1', isFavorite: true });
    const second = makeRecipe({ id: 'favorite-2', name: 'Otra sopa', isFavorite: true });
    service.loadRecipes();
    http.expectOne('/api/recipes').flush({ data: { recipes: [first, second], total: 2 } });

    service.toggleFavorite(first.id);
    http
      .expectOne({ method: 'POST', url: `/api/recipes/${first.id}/favorite` })
      .flush({ data: { isFavorite: false } });

    expect(service.recipes()).toEqual([{ ...first, isFavorite: false }, second]);
    expect(service.total()).toBe(2);
  });

  it('keeps the loaded filter when a later filter request fails', () => {
    const first = makeRecipe({ id: 'favorite-1', isFavorite: true });
    const second = makeRecipe({ id: 'favorite-2', name: 'Otra sopa', isFavorite: true });
    service.loadRecipes();
    http.expectOne('/api/recipes').flush({ data: { recipes: [first, second], total: 2 } });

    service.loadRecipes({ isFavorite: true });
    http
      .expectOne('/api/recipes?isFavorite=true')
      .flush({}, { status: 500, statusText: 'Server Error' });
    expect(service.recipes()).toEqual([first, second]);

    service.toggleFavorite(first.id);
    http
      .expectOne({ method: 'POST', url: `/api/recipes/${first.id}/favorite` })
      .flush({ data: { isFavorite: false } });

    expect(service.recipes()).toEqual([{ ...first, isFavorite: false }, second]);
    expect(service.total()).toBe(2);
  });

  it('increments cooking count once on success and keeps it on failure', () => {
    const initial = makeRecipe();
    service.loadRecipes();
    http.expectOne('/api/recipes').flush({ data: { recipes: [initial], total: 1 } });

    service.recordCooking(initial.id);
    http.expectOne({ method: 'POST', url: `/api/recipes/${initial.id}/cook` }).flush({ success: true });
    expect(service.recipes()[0].timesCooked).toBe(1);

    service.recordCooking(initial.id);
    http.expectOne({ method: 'POST', url: `/api/recipes/${initial.id}/cook` }).flush({}, { status: 500, statusText: 'Server Error' });
    expect(service.recipes()[0].timesCooked).toBe(1);
  });

  it('posts adjusted servings and returns the API response', () => {
    let result: unknown;
    service.adjustServings('recipe-1', 3).subscribe((value) => result = value);
    http.expectOne((request) => request.url === '/api/recipes/recipe-1/adjust-servings' && request.method === 'POST')
      .flush({ data: { servings: 3 } });
    expect(result).toEqual({ data: { servings: 3 } });
  });

  it('deletes only the selected recipe, and keeps the list when deletion fails', () => {
    const first = makeRecipe();
    const second = makeRecipe({ id: 'recipe-2', name: 'Otra' });
    service.loadRecipes();
    http.expectOne('/api/recipes').flush({ data: { recipes: [first, second], total: 2 } });

    let result: boolean | undefined;
    service.deleteRecipe(first.id).subscribe((value) => result = value);
    http.expectOne({ method: 'DELETE', url: `/api/recipes/${first.id}` }).flush({ success: true });
    expect(result).toBeTrue();
    expect(service.recipes()).toEqual([second]);

    let failed: boolean | undefined;
    service.deleteRecipe(second.id).subscribe((value) => failed = value);
    http.expectOne({ method: 'DELETE', url: `/api/recipes/${second.id}` }).flush({}, { status: 500, statusText: 'Server Error' });
    expect(failed).toBeFalse();
    expect(service.recipes()).toEqual([second]);
  });
});
