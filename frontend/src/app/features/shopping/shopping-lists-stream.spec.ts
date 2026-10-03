import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { ShoppingService } from '../../core/services/shopping.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { I18nService } from '../../core/services/i18n.service';
import { ShoppingListsComponent } from './shopping-lists.component';

describe('ShoppingListsComponent live tray stream', () => {
  let closeStream: jasmine.Spy;
  let openStream: jasmine.Spy;

  beforeEach(async () => {
    closeStream = jasmine.createSpy('closeStream');
    openStream = jasmine.createSpy('openStream').and.returnValue(closeStream);

    const shopping = {
      lists: signal([]),
      loadingLists: signal(false),
      saving: signal(false),
      listsMeta: signal({ total: 0, limit: 25, offset: 0 }),
      stores: signal([]),
      loadLists: jasmine.createSpy('loadLists'),
      loadStores: jasmine.createSpy('loadStores'),
      openStream
    };

    await TestBed.configureTestingModule({
      imports: [ShoppingListsComponent],
      providers: [
        { provide: ShoppingService, useValue: shopping },
        { provide: ConfirmService, useValue: {} },
        { provide: ToastService, useValue: {} },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: I18nService, useValue: { t: (key: string) => key } }
      ]
    })
      .overrideComponent(ShoppingListsComponent, { set: { template: '' } })
      .compileComponents();
  });

  it('subscribes to the tray channel and closes it when the view is destroyed', () => {
    const fixture = TestBed.createComponent(ShoppingListsComponent);
    fixture.detectChanges();

    expect(openStream).toHaveBeenCalledOnceWith('tray', jasmine.any(Function));

    fixture.destroy();

    expect(closeStream).toHaveBeenCalledTimes(1);
  });
});
