import {
  COMMIT_RATIO,
  LONG_PRESS_MS,
  REVEAL_PX,
  isQuickPlus,
  swipeState
} from './swipe-row.directive';

/**
 * La matematica del gesto, aparte del dedo. Es lo unico que se puede probar sin
 * un movil delante, y es tambien lo que el contrato de UI fija: 56 px para asomar
 * el riel, el 60 % del ancho para ejecutar, 350 ms de pulsacion larga.
 */
describe('swipe-row — umbrales del gesto', () => {
  const WIDTH = 400;

  it('un dedo que duda no descubre nada', () => {
    expect(swipeState(0, WIDTH)).toEqual({ reveal: 0, armed: false });
    expect(swipeState(-20, WIDTH)).toEqual({ reveal: 0, armed: false });
    expect(swipeState(-REVEAL_PX + 1, WIDTH).reveal).toBe(0);
  });

  it('a partir de 56 px el riel asoma, y crece con el arrastre', () => {
    expect(swipeState(-REVEAL_PX, WIDTH).reveal).toBeCloseTo(REVEAL_PX / WIDTH, 5);
    expect(swipeState(-REVEAL_PX, WIDTH).armed).toBeFalse();
    expect(swipeState(-WIDTH / 2, WIDTH).reveal).toBeCloseTo(0.5, 5);
  });

  it('cruzar el 60 % arma la accion: al soltar se ejecuta, no se mira', () => {
    expect(COMMIT_RATIO).toBe(0.6);
    expect(swipeState(-(WIDTH * COMMIT_RATIO - 1), WIDTH).armed).toBeFalse();
    expect(swipeState(-(WIDTH * COMMIT_RATIO), WIDTH).armed).toBeTrue();
    expect(swipeState(-WIDTH, WIDTH).armed).toBeTrue();
  });

  it('hacia la derecha no hay riel que descubrir', () => {
    expect(swipeState(120, WIDTH).reveal).toBe(0);
    expect(swipeState(120, WIDTH).armed).toBeFalse();
  });

  it('un ancho cero no parte la pantalla (fila oculta, anidada en una transicion)', () => {
    expect(swipeState(-100, 0)).toEqual({ reveal: 0, armed: false });
  });

  it('el swipe derecha cuenta una unidad solo si es decidido', () => {
    expect(isQuickPlus(40, WIDTH)).toBeFalse();
    expect(isQuickPlus(WIDTH * 0.35, WIDTH)).toBeTrue();
    expect(isQuickPlus(WIDTH, WIDTH)).toBeTrue();
    expect(isQuickPlus(-WIDTH, WIDTH)).toBeFalse();
    expect(isQuickPlus(200, 0)).toBeFalse();
  });

  it('la pulsacion larga es de 350 ms, ni un toque ni una espera corta', () => {
    expect(LONG_PRESS_MS).toBe(350);
  });
});
