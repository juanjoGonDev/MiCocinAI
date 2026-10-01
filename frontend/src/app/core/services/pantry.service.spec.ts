import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SILENT_TOAST } from '../interceptors/error.interceptor';
import { CaducidadRow } from '../../shared/models/caducidades.model';
import { PantryService } from './pantry.service';

const CADUCIDAD: CaducidadRow = {
  id: 'qa-expiry-1',
  name: 'Tomates de prueba',
  category: 'other',
  quantity: 2,
  unit: 'ud',
  expirationDate: '2026-10-04',
  estimatedDays: null,
  shelfSource: 'fecha',
  vence: '2026-10-04',
  daysLeft: 2,
  cadaDias: null,
  unidadesPorCompra: null,
  duraDias: null,
  lastBought: null
};

describe('PantryService expiry loading', () => {
  let service: PantryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PantryService]
    });
    service = TestBed.inject(PantryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('represents a successful empty response as empty, not as an error', () => {
    service.loadCaducidades();

    expect(service.cargandoCaducidades()).toBeTrue();
    expect(service.caducidadesError()).toBeFalse();
    http.expectOne('/api/pantry/expiry').flush({ data: [] });

    expect(service.cargandoCaducidades()).toBeFalse();
    expect(service.caducidadesError()).toBeFalse();
    expect(service.caducidades()).toEqual([]);
  });

  it('surfaces a failed expiry request and always exits loading', () => {
    service.loadCaducidades();
    const request = http.expectOne('/api/pantry/expiry');
    expect(request.request.context.get(SILENT_TOAST)).toBeTrue();
    request.flush({}, { status: 503, statusText: 'Service Unavailable' });

    expect(service.cargandoCaducidades()).toBeFalse();
    expect(service.caducidadesError()).toBeTrue();
    expect(service.caducidades()).toEqual([]);
  });

  it('treats a malformed successful payload as a load error instead of an empty pantry', () => {
    service.loadCaducidades();
    http.expectOne('/api/pantry/expiry').flush({ data: null });

    expect(service.cargandoCaducidades()).toBeFalse();
    expect(service.caducidadesError()).toBeTrue();
    expect(service.caducidades()).toEqual([]);
  });

  it('clears the error and replaces rows when a retry succeeds', () => {
    service.loadCaducidades();
    http
      .expectOne('/api/pantry/expiry')
      .flush({}, { status: 503, statusText: 'Service Unavailable' });
    expect(service.caducidadesError()).toBeTrue();

    service.loadCaducidades();
    expect(service.cargandoCaducidades()).toBeTrue();
    expect(service.caducidadesError()).toBeFalse();
    http.expectOne('/api/pantry/expiry').flush({ data: [CADUCIDAD] });

    expect(service.cargandoCaducidades()).toBeFalse();
    expect(service.caducidadesError()).toBeFalse();
    expect(service.caducidades()).toEqual([CADUCIDAD]);
  });

  it('keeps a retryable error state when the retry also fails', () => {
    service.loadCaducidades();
    http
      .expectOne('/api/pantry/expiry')
      .flush({}, { status: 503, statusText: 'Service Unavailable' });

    service.loadCaducidades();
    http
      .expectOne('/api/pantry/expiry')
      .flush({}, { status: 503, statusText: 'Service Unavailable' });

    expect(service.cargandoCaducidades()).toBeFalse();
    expect(service.caducidadesError()).toBeTrue();
  });
});
