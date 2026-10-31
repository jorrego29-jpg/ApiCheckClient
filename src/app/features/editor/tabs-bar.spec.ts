import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { withUrl } from '../../core/requests/request-draft';
import { CollectionsStore } from '../../core/state/collections.store';
import { TabsStore } from '../../core/state/tabs.store';
import { savedRequest, seedWorkspace } from '../../testing/editor.testing';
import { TabsBar } from './tabs-bar';

describe('TabsBar', () => {
  let http: HttpTestingController;
  let tabs: TabsStore;
  let collections: CollectionsStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabsBar],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: { add: () => undefined } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    collections = TestBed.inject(CollectionsStore);
    tabs = TestBed.inject(TabsStore);
    seedWorkspace(http, [
      savedRequest('r1', { method: 'POST' }),
      savedRequest('r2', { protocol: 'SOAP', method: null }),
    ]);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  async function open(...ids: string[]) {
    const fixture = TestBed.createComponent(TabsBar);
    for (const id of ids) {
      collections.selectRequest(id);
      TestBed.tick();
    }
    await fixture.whenStable();
    return fixture;
  }

  it('shows nothing while no request is open', async () => {
    const element = (await open()).nativeElement as HTMLElement;

    expect(element.querySelector('.tab')).toBeNull();
  });

  it('shows a tab per open request, with its method or SOAP, and marks the active one', async () => {
    const element = (await open('r1', 'r2')).nativeElement as HTMLElement;

    const items = Array.from(element.querySelectorAll('.tab'));
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.method')?.textContent?.trim()).toBe('POST');
    expect(items[1].querySelector('.method')?.textContent?.trim()).toBe('SOAP');
    expect(items[0].classList).not.toContain('is-active');
    expect(items[1].classList).toContain('is-active');
  });

  it('activates a tab when it is clicked', async () => {
    const element = (await open('r1', 'r2')).nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('.tab .main')!.click();
    TestBed.tick();

    expect(tabs.activeId()).toBe('r1');
  });

  it('closes a tab without changes right away', async () => {
    const element = (await open('r1', 'r2')).nativeElement as HTMLElement;

    element.querySelectorAll<HTMLButtonElement>('.tab .close')[1].click();

    expect(tabs.tabs().map((tab) => tab.id)).toEqual(['r1']);
  });

  it('marks a tab with unsaved changes and does not close it without asking', async () => {
    const fixture = await open('r1');
    const element = fixture.nativeElement as HTMLElement;

    tabs.edit('r1', (draft) => withUrl(draft, 'https://api.test/otra'));
    await fixture.whenStable();

    expect(element.querySelector('.tab .dirty')).not.toBeNull();

    element.querySelector<HTMLButtonElement>('.tab .close')!.click();

    expect(tabs.tabs().map((tab) => tab.id)).toEqual(['r1']);
  });
});
