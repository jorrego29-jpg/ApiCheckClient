import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let added: Parameters<MessageService['add']>[0][];

  beforeEach(() => {
    vi.useFakeTimers();
    added = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MessageService,
          useValue: { add: (m: (typeof added)[number]) => added.push(m) },
        },
      ],
    });
    service = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends an error toast with its message and duration', () => {
    service.error('Algo falló', 1000);
    expect(added).toEqual([
      { severity: 'error', summary: 'Error', detail: 'Algo falló', life: 1000 },
    ]);
  });

  it('maps success and info to their severities', () => {
    service.success('Guardado');
    service.info('Sincronizando');
    expect(added.map((m) => m?.severity)).toEqual(['success', 'info']);
  });

  it('does not stack identical messages while one is visible', () => {
    service.error('Sin conexión');
    service.error('Sin conexión');
    expect(added).toHaveLength(1);
  });

  it('shows the same message again once the previous one has expired', () => {
    service.error('Sin conexión', 1000);
    vi.advanceTimersByTime(1000);
    service.error('Sin conexión', 1000);
    expect(added).toHaveLength(2);
  });

  it('keeps messages of a different kind', () => {
    service.error('Listo');
    service.success('Listo');
    expect(added).toHaveLength(2);
  });
});
