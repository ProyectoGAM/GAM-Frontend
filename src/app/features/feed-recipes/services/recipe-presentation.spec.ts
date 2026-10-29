import { convertToParamMap } from '@angular/router';
import { ingredientPreview, recipeFilters, recipeKilograms } from './recipe-presentation';

describe('Recipe presentation', () => {
  it.each([['13000', '13 kg'], ['13001', '13,001 kg'], ['5', '0,005 kg'], ['1000000', '1.000 kg'], ['9223372036854775807', '9.223.372.036.854.775,807 kg']])('displays %s grams exactly', (grams, label) => {
    expect(recipeKilograms(grams)).toBe(label);
  });

  it('bounds a long ingredient preview without dropping the count or changing names', () => {
    const ingredients = Array.from({ length: 7 }, (_, index) => ({ producto_id: index + 1, nombre: `Ingrediente ${index + 1}`, sku: 'SKU', cantidad_g: '1' }));
    expect(ingredientPreview(ingredients)).toBe('Ingrediente 1, Ingrediente 2, Ingrediente 3, Ingrediente 4 y 3 más');
  });

  it('accepts only the contracted status, search and bounded page from URL state', () => {
    expect(recipeFilters(convertToParamMap({ buscar: '  BB  ', estado: 'inactive', page: '2', up_id: '4' })))
      .toEqual({ buscar: 'BB', estado: 'inactive', page: 2 });
    for (const page of ['-1', '1.5', '1000001', 'invalid', '0']) {
      expect(recipeFilters(convertToParamMap({ estado: 'draft', page, buscar: 'a'.repeat(130) })))
        .toEqual({ buscar: 'a'.repeat(120), estado: '', page: 1 });
    }
  });
});
